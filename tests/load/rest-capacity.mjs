/**
 * REST Capacity Load Test
 *
 * Authenticates against Supabase for a real JWT, then runs stepped concurrency
 * against the local Spring server's lobby flow:
 *   GET /health → GET /rooms → GET /me/stats → POST /rooms → POST /rooms/{code}/leave
 *
 * Usage:
 *   npm run load:rest:capacity
 *
 * Environment variables (with defaults):
 *   LOAD_BASE_URL          = http://localhost:8080
 *   LOAD_SUPABASE_URL      = (from .env.local / PUBLIC_SUPABASE_URL)
 *   LOAD_SUPABASE_ANON_KEY = (from .env.local / PUBLIC_SUPABASE_ANON_KEY)
 *   LOAD_EMAIL             = (required)
 *   LOAD_PASSWORD           = (required)
 *   LOAD_STEPS             = 1,5,10,15,20,25,50
 *   LOAD_STEP_DURATION_SEC = 30
 *   LOAD_PAUSE_MS          = 1000
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, 'results');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function parseConfig() {
    const baseUrl = (process.env.LOAD_BASE_URL || 'http://localhost:8080').replace(/\/$/u, '');
    const supabaseUrl = process.env.LOAD_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.LOAD_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
    const email = process.env.LOAD_EMAIL;
    const password = process.env.LOAD_PASSWORD;
    const steps = (process.env.LOAD_STEPS || '1, 5, 10, 25, 50, 100')
    // const steps = (process.env.LOAD_STEPS || '100, 500, 1000, 5000, 10000')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);
    const stepDurationSec = Number(process.env.LOAD_STEP_DURATION_SEC) || 30;
    const pauseMs = Number(process.env.LOAD_PAUSE_MS) || 1000;

    const missing = [];
    if (!supabaseUrl) missing.push('LOAD_SUPABASE_URL or PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('LOAD_SUPABASE_ANON_KEY or PUBLIC_SUPABASE_ANON_KEY');
    if (!email) missing.push('LOAD_EMAIL');
    if (!password) missing.push('LOAD_PASSWORD');

    if (missing.length > 0) {
        console.error(`[load] Missing required env vars: ${missing.join(', ')}`);
        console.error('[load] Set them in .env.local or export them before running.');
        process.exit(1);
    }

    return { baseUrl, supabaseUrl, supabaseAnonKey, email, password, steps, stepDurationSec, pauseMs };
}

// ---------------------------------------------------------------------------
// Supabase authentication
// ---------------------------------------------------------------------------

async function authenticate(supabaseUrl, supabaseAnonKey, email, password) {
    const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    console.log('[load] Authenticating with Supabase...');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const body = await res.text();
        console.error(`[load] Supabase auth failed (${res.status}): ${body}`);
        process.exit(1);
    }

    const data = await res.json();
    console.log('[load] Authentication successful.');
    return data.access_token;
}

// ---------------------------------------------------------------------------
// Lobby flow
// ---------------------------------------------------------------------------

async function timedFetch(url, options) {
    const start = performance.now();
    let ok = true;
    let status = 0;
    let error = null;
    try {
        const res = await fetch(url, options);
        status = res.status;
        ok = res.ok;
        const body = await res.text();
        if (!ok) {
            error = extractError(status, body);
        }
    } catch (err) {
        ok = false;
        error = err.message || 'Unknown network error';
    }
    const elapsed = performance.now() - start;
    return { ok, status, elapsed, error };
}

function extractError(status, body) {
    try {
        const json = JSON.parse(body);
        return json.message || json.error || `${status}: ${body.slice(0, 200)}`;
    } catch {
        return `${status}: ${body.slice(0, 200)}`;
    }
}

/**
 * Run one iteration of the lobby flow. Returns an array of per-request measurements.
 */
async function lobbyFlow(baseUrl, token) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const results = [];

    // 1. GET /health (no auth needed but include for realistic flow)
    results.push({ endpoint: 'GET /health', ...(await timedFetch(`${baseUrl}/health`)) });

    // 2. GET /rooms
    results.push({ endpoint: 'GET /rooms', ...(await timedFetch(`${baseUrl}/rooms`, { headers })) });

    // 3. GET /me/stats
    results.push({
        endpoint: 'GET /me/stats',
        ...(await timedFetch(`${baseUrl}/me/stats`, { headers })),
    });

    // 4. POST /rooms (create a room) - need both timing and response body for room code
    let roomCode = null;
    {
        const start = performance.now();
        let ok = true;
        let status = 0;
        let error = null;
        try {
            const res = await fetch(`${baseUrl}/rooms`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ gameType: 'fem' }),
            });
            status = res.status;
            ok = res.ok;
            if (ok) {
                const body = await res.json();
                roomCode = body.roomCode || body.code || null;
            } else {
                const body = await res.text();
                error = extractError(status, body);
            }
        } catch (err) {
            ok = false;
            error = err.message || 'Unknown network error';
        }
        const elapsed = performance.now() - start;
        results.push({ endpoint: 'POST /rooms', ok, status, elapsed, error });
    }

    // 5. POST /rooms/{code}/leave
    if (roomCode) {
        results.push({
            endpoint: 'POST /rooms/{code}/leave',
            ...(await timedFetch(`${baseUrl}/rooms/${roomCode}/leave`, { method: 'POST', headers })),
        });
    } else {
        // If room creation failed, record a synthetic failure for leave
        results.push({ endpoint: 'POST /rooms/{code}/leave', ok: false, status: 0, elapsed: 0 });
    }

    return results;
}

// ---------------------------------------------------------------------------
// Worker / step runner
// ---------------------------------------------------------------------------

async function runWorker(baseUrl, token, durationMs, pauseMs, signal) {
    const allResults = [];
    while (!signal.stopped) {
        const iterResults = await lobbyFlow(baseUrl, token);
        allResults.push(...iterResults);
        if (signal.stopped) break;
        await sleep(pauseMs);
    }
    return allResults;
}

async function runStep(concurrency, config, token) {
    const { baseUrl, stepDurationSec, pauseMs } = config;
    const durationMs = stepDurationSec * 1000;

    console.log(`[load] Step: ${concurrency} virtual users for ${stepDurationSec}s ...`);

    const signal = { stopped: false };
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push(runWorker(baseUrl, token, durationMs, pauseMs, signal));
    }

    // Stop after duration
    await sleep(durationMs);
    signal.stopped = true;

    const workerResults = await Promise.all(workers);
    const allResults = workerResults.flat();

    return allResults;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, index)];
}

function computeStats(results) {
    const total = results.length;
    const errors = results.filter((r) => !r.ok).length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    const latencies = results.map((r) => r.elapsed).sort((a, b) => a - b);
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    // Status code distribution
    const statusCodes = {};
    for (const r of results) {
        const code = r.status || 'ERR';
        statusCodes[code] = (statusCodes[code] || 0) + 1;
    }

    // Per-endpoint breakdown
    const endpoints = {};
    for (const r of results) {
        if (!endpoints[r.endpoint]) {
            endpoints[r.endpoint] = { total: 0, errors: 0, latencies: [], statusCodes: {}, errorReasons: {} };
        }
        endpoints[r.endpoint].total++;
        if (!r.ok) {
            endpoints[r.endpoint].errors++;
            if (r.error) {
                endpoints[r.endpoint].errorReasons[r.error] = (endpoints[r.endpoint].errorReasons[r.error] || 0) + 1;
            }
        }
        endpoints[r.endpoint].latencies.push(r.elapsed);
        const code = r.status || 'ERR';
        endpoints[r.endpoint].statusCodes[code] = (endpoints[r.endpoint].statusCodes[code] || 0) + 1;
    }

    for (const ep of Object.values(endpoints)) {
        ep.latencies.sort((a, b) => a - b);
        ep.errorRate = ep.total > 0 ? (ep.errors / ep.total) * 100 : 0;
        ep.p50 = percentile(ep.latencies, 50);
        ep.p95 = percentile(ep.latencies, 95);
        ep.p99 = percentile(ep.latencies, 99);
        // Keep only top 3 error reasons by count
        ep.topErrors = Object.entries(ep.errorReasons)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([reason, count]) => ({ reason, count }));
    }

    return { total, errors, errorRate, p50, p95, p99, statusCodes, endpoints };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatStatusCodes(statusCodes) {
    return Object.entries(statusCodes)
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([code, count]) => `${code}:${count}`)
        .join(' ');
}

function printStepSummary(concurrency, stats) {
    console.log(
        `  VU=${String(concurrency).padStart(3)} | ` +
            `reqs=${String(stats.total).padStart(6)} | ` +
            `errs=${String(stats.errors).padStart(5)} (${stats.errorRate.toFixed(2).padStart(6)}%) | ` +
            `p50=${stats.p50.toFixed(2).padStart(10)}ms | ` +
            `p95=${stats.p95.toFixed(2).padStart(10)}ms | ` +
            `p99=${stats.p99.toFixed(2).padStart(10)}ms`,
    );
    console.log(`         status codes: ${formatStatusCodes(stats.statusCodes)}`);
    for (const [name, ep] of Object.entries(stats.endpoints)) {
        if (ep.errors > 0) {
            console.log(`         ${name}: ${formatStatusCodes(ep.statusCodes)}`);
            for (const { reason, count } of ep.topErrors) {
                console.log(`           → ${count}× ${reason}`);
            }
        }
    }
}

function printSummaryTable(stepResults) {
    console.log('\n[load] ============= Summary =============');
    console.log(
        '  VU   | Requests |  Errors |  Err%   |   p50 (ms) |   p95 (ms) |   p99 (ms)',
    );
    console.log(
        '  ---- | -------- | ------- | ------- | ---------- | ---------- | ----------',
    );
    for (const { concurrency, stats } of stepResults) {
        console.log(
            `  ${String(concurrency).padStart(4)} | ` +
                `${String(stats.total).padStart(8)} | ` +
                `${String(stats.errors).padStart(7)} | ` +
                `${stats.errorRate.toFixed(2).padStart(6)}% | ` +
                `${stats.p50.toFixed(2).padStart(10)} | ` +
                `${stats.p95.toFixed(2).padStart(10)} | ` +
                `${stats.p99.toFixed(2).padStart(10)}`,
        );
    }
    console.log('[load] ========================================\n');
}

async function writeResults(stepResults, config) {
    await mkdir(RESULTS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');

    // Per-step JSON
    const jsonPath = path.join(RESULTS_DIR, `capacity-${timestamp}.json`);
    const jsonData = {
        timestamp: new Date().toISOString(),
        config: {
            baseUrl: config.baseUrl,
            steps: config.steps,
            stepDurationSec: config.stepDurationSec,
            pauseMs: config.pauseMs,
        },
        results: stepResults.map(({ concurrency, stats }) => ({
            concurrency,
            total: stats.total,
            errors: stats.errors,
            errorRate: stats.errorRate,
            p50: stats.p50,
            p95: stats.p95,
            p99: stats.p99,
            statusCodes: stats.statusCodes,
            endpoints: Object.fromEntries(
                Object.entries(stats.endpoints).map(([name, ep]) => [
                    name,
                    { total: ep.total, errors: ep.errors, errorRate: ep.errorRate, statusCodes: ep.statusCodes, topErrors: ep.topErrors, p50: ep.p50, p95: ep.p95, p99: ep.p99 },
                ]),
            ),
        })),
    };
    await writeFile(jsonPath, JSON.stringify(jsonData, null, 2) + '\n');
    console.log(`[load] JSON results written to ${jsonPath}`);

    // Markdown report
    const mdPath = path.join(RESULTS_DIR, `capacity-${timestamp}.md`);
    const mdLines = [
        '# REST Capacity Load Test Results',
        '',
        `**Date:** ${new Date().toISOString()}`,
        `**Base URL:** ${config.baseUrl}`,
        `**Step duration:** ${config.stepDurationSec}s`,
        `**Pause between iterations:** ${config.pauseMs}ms`,
        '',
        '## Summary',
        '',
        '| VU | Requests | Errors | Error % | p50 (ms) | p95 (ms) | p99 (ms) |',
        '|---|---|---|---|---|---|---|',
    ];

    for (const { concurrency, stats } of stepResults) {
        mdLines.push(
            `| ${concurrency} | ${stats.total} | ${stats.errors} | ${stats.errorRate.toFixed(2)}% | ${stats.p50.toFixed(2)} | ${stats.p95.toFixed(2)} | ${stats.p99.toFixed(2)} |`,
        );
    }

    mdLines.push('', '## Per-Endpoint Breakdown', '');

    for (const { concurrency, stats } of stepResults) {
        mdLines.push(`### ${concurrency} Virtual Users`, '');
        mdLines.push('| Endpoint | Requests | Errors | Error % | Status Codes | p50 (ms) | p95 (ms) | p99 (ms) |');
        mdLines.push('|---|---|---|---|---|---|---|---|');
        for (const [name, ep] of Object.entries(stats.endpoints)) {
            const codes = Object.entries(ep.statusCodes)
                .sort(([a], [b]) => String(a).localeCompare(String(b)))
                .map(([code, count]) => `${code}:${count}`)
                .join(', ');
            mdLines.push(
                `| ${name} | ${ep.total} | ${ep.errors} | ${ep.errorRate.toFixed(2)}% | ${codes} | ${ep.p50.toFixed(2)} | ${ep.p95.toFixed(2)} | ${ep.p99.toFixed(2)} |`,
            );
        }

        // Error reasons for this step
        const hasErrors = Object.values(stats.endpoints).some((ep) => ep.topErrors.length > 0);
        if (hasErrors) {
            mdLines.push('', '**Error reasons:**', '');
            for (const [name, ep] of Object.entries(stats.endpoints)) {
                for (const { reason, count } of ep.topErrors) {
                    mdLines.push(`- **${name}**: ${count}× \`${reason}\``);
                }
            }
        }

        mdLines.push('');
    }

    await writeFile(mdPath, mdLines.join('\n') + '\n');
    console.log(`[load] Markdown report written to ${mdPath}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async function healthCheck(baseUrl) {
    console.log(`[load] Checking server health at ${baseUrl}/health ...`);
    try {
        const res = await fetch(`${baseUrl}/health`);
        if (!res.ok) {
            console.error(`[load] Health check failed (${res.status}). Is the server running?`);
            process.exit(1);
        }
        await res.text();
        console.log('[load] Server is reachable.');
    } catch (err) {
        console.error(`[load] Cannot reach server at ${baseUrl}: ${err.message}`);
        console.error('[load] Start the server with: npm run server:local');
        process.exit(1);
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('[load] REST Capacity Load Test');
    console.log('[load] ========================\n');

    const config = parseConfig();

    console.log(`[load] Base URL:       ${config.baseUrl}`);
    console.log(`[load] Steps:          ${config.steps.join(', ')} VU`);
    console.log(`[load] Step duration:  ${config.stepDurationSec}s`);
    console.log(`[load] Pause:          ${config.pauseMs}ms\n`);

    await healthCheck(config.baseUrl);

    const token = await authenticate(config.supabaseUrl, config.supabaseAnonKey, config.email, config.password);

    const stepResults = [];

    for (const concurrency of config.steps) {
        const results = await runStep(concurrency, config, token);
        const stats = computeStats(results);
        stepResults.push({ concurrency, stats });
        printStepSummary(concurrency, stats);
    }

    printSummaryTable(stepResults);
    await writeResults(stepResults, config);

    console.log('[load] Done.');
}

main().catch((err) => {
    console.error('[load] Fatal error:', err);
    process.exit(1);
});
