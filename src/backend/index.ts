import { OAUTH_PROVIDERS, ONLINE } from '../lib/config';
import { createDemoBackend } from './demo';
import type { Backend } from './types';

/**
 * The Supabase client is only downloaded when Supabase is configured, so the
 * demo build stays light.
 */
function lazyOnline(): Backend {
  let loading: Promise<Backend> | null = null;
  const load = () => (loading ??= import('./online').then((m) => m.createOnlineBackend()));
  const base = { mode: 'online' as const, oauthProviders: OAUTH_PROVIDERS };
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

export const backend: Backend = ONLINE ? lazyOnline() : createDemoBackend();
export * from './types';
