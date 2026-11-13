const env = import.meta.env;
export const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
export const ONLINE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const OAUTH_PROVIDERS = ((env.VITE_AUTH_PROVIDERS as string | undefined) || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter((s): s is 'apple' | 'google' => s === 'apple' || s === 'google');
