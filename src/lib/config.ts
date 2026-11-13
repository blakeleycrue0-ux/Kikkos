const env = import.meta.env;
export const SUPABASE_URL = (env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
export const ONLINE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const OAUTH_PROVIDERS = ((env.VITE_AUTH_PROVIDERS as string | undefined) || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter((s): s is 'apple' | 'google' => s === 'apple' || s === 'google');
/** Email codes need a custom SMTP sender in Supabase; enable only once that is set up. */
export const EMAIL_LOGIN = ((env.VITE_AUTH_EMAIL as string | undefined) || '').trim() === 'on';
