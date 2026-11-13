import { EMAIL_LOGIN, OAUTH_PROVIDERS, ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/config';
import { load, save } from '../lib/prefs';
import { createDemoBackend } from './demo';
import type { Backend } from './types';

interface AuthCaps { quickPlay: boolean; emailLogin: boolean }

/** The Supabase client is only downloaded when the online backend is active. */
function lazyOnline(caps: AuthCaps): Backend {
  let loading: Promise<Backend> | null = null;
  const load = () => (loading ??= import('./online').then((m) => m.createOnlineBackend(caps)));
  const base = { mode: 'online' as const, oauthProviders: OAUTH_PROVIDERS, quickPlay: caps.quickPlay, emailLogin: caps.emailLogin };
  return new Proxy(base as unknown as Backend, {
    get(target, prop: string) {
      if (prop in target) return (target as unknown as Record<string, unknown>)[prop];
      if (prop === 'resetDemo' || prop === 'then') return undefined;
      if (prop === 'onAuthChange') {
        return (cb: () => void) => {
          let off: (() => void) | null = null;
          let cancelled = false;
          void load().then((b) => { if (!cancelled) off = b.onAuthChange(cb); });
          return () => { cancelled = true; off?.(); };
        };
      }
      return (...args: unknown[]) => load().then((b) => (b as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args));
    },
  });
}

/** Live binding: replaced by the online backend once we know players can actually sign in. */
// eslint-disable-next-line import/no-mutable-exports
export let backend: Backend = createDemoBackend();

/**
 * Online mode is used only when Supabase is configured AND at least one sign-in
 * method players can really use is enabled. Otherwise the app stays in the
 * clearly-labelled demo mode. The result is cached for an instant next launch.
 */
export async function initBackend(): Promise<void> {
  if (!ONLINE) return;
  const cached = load<AuthCaps | null>('auth-caps', null);
  const probe = fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((s: { external?: Record<string, boolean> }) => {
      const caps = { quickPlay: !!s.external?.anonymous_users, emailLogin: EMAIL_LOGIN && !!s.external?.email };
      save('auth-caps', caps);
      return caps;
    });
  let caps: AuthCaps | null;
  // Known answer: start instantly and refresh it in the background (applies on the next launch).
  // First visit ever: wait briefly for the real answer so the mode is right from the start.
  if (cached) { caps = cached; void probe.catch(() => {}); }
  else caps = await Promise.race([probe.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1200))]);
  if (caps && (caps.quickPlay || caps.emailLogin)) backend = lazyOnline(caps);
}

export * from './types';
