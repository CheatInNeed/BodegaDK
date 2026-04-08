declare global {
    interface Window {
        supabase: any;
        __BODEGADK_CONFIG__?: {
            supabaseUrl?: string;
            supabaseAnonKey?: string;
        };
    }
}

function readConfigValue(value: string | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
}

const rawConfig = window.__BODEGADK_CONFIG__ ?? {};
const supabaseUrl = readConfigValue(rawConfig.supabaseUrl);
const supabaseAnonKey = readConfigValue(rawConfig.supabaseAnonKey);
const hasSupabaseSdk = typeof window.supabase?.createClient === 'function';

export const isSupabaseConfigured = hasSupabaseSdk && supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
export const supabaseUnavailableMessage = 'Supabase auth/profile features are unavailable. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY before serving the web client.';

export const supabase = isSupabaseConfigured
    ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
    : null;
