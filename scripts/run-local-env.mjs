import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const safeDefaults = {
    PUBLIC_SUPABASE_URL: 'https://awdhzmyieafhfpjmzwsh.supabase.co',
    PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_9e9yYV-9LVB4l7_tsBU8tw_hyPtg3tu',
    SUPABASE_JWT_ISSUER: 'https://awdhzmyieafhfpjmzwsh.supabase.co/auth/v1',
};

const separatorIndex = process.argv.indexOf('--');
const command = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 1) : process.argv.slice(2);

if (command.length === 0) {
    console.error('Usage: node scripts/run-local-env.mjs -- <command>');
    process.exit(1);
}

const envFromFiles = await loadEnvFiles([
    path.resolve(repoRoot, '.env.local'),
    path.resolve(repoRoot, '.env'),
]);

const env = {
    ...safeDefaults,
    ...envFromFiles,
    ...process.env,
};

const executable = process.platform === 'win32' && command[0] === 'npm' ? 'npm.cmd' : command[0];

const child = spawn(executable, command.slice(1), {
    cwd: repoRoot,
    env,
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 1);
});

async function loadEnvFiles(filePaths) {
    const values = {};

    for (const filePath of filePaths) {
        try {
            const contents = await readFile(filePath, 'utf8');
            Object.assign(values, parseEnvFile(contents));
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                continue;
            }
            throw error;
        }
    }

    return values;
}

function parseEnvFile(contents) {
    const values = {};

    for (const rawLine of contents.split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separator = line.indexOf('=');
        if (separator <= 0) {
            continue;
        }

        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();

        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        }

        values[key] = value;
    }

    return values;
}
