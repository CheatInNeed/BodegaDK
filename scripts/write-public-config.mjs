import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(__dirname, '../apps/web/public/app-config.js');

const envFromFiles = await loadEnvFiles([
    path.resolve(repoRoot, '.env.local'),
    path.resolve(repoRoot, '.env'),
    path.resolve(repoRoot, 'apps/web/.env.local'),
    path.resolve(repoRoot, 'apps/web/.env'),
]);

const config = {
    supabaseUrl: readEnv('PUBLIC_SUPABASE_URL', envFromFiles),
    supabaseAnonKey: readEnv('PUBLIC_SUPABASE_ANON_KEY', envFromFiles),
};

const fileContents = `window.__BODEGADK_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, fileContents, 'utf8');

const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const status = configured ? 'configured' : 'disabled (missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY)';

console.log(`[web-config] Wrote ${outputPath}`);
console.log(`[web-config] Supabase auth/profile support is ${status}.`);

function readEnv(key, envFromFiles) {
    const fromProcess = process.env[key];
    if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
        return fromProcess.trim();
    }

    const fromFile = envFromFiles[key];
    return typeof fromFile === 'string' ? fromFile.trim() : '';
}

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

        const separatorIndex = line.indexOf('=');
        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

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
