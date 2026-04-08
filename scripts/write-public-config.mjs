import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../apps/web/public/app-config.js');

const config = {
    supabaseUrl: process.env.PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
};

const fileContents = `window.__BODEGADK_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, fileContents, 'utf8');

const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const status = configured ? 'configured' : 'disabled (missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY)';

console.log(`[web-config] Wrote ${outputPath}`);
console.log(`[web-config] Supabase auth/profile support is ${status}.`);
