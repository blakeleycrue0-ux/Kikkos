import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { backend, type Session, type TodayInfo } from '../backend';
import { load, save } from '../lib/prefs';
import type { Direction, Route, Tab } from './routes';

interface Toast { id: number; text: string; tone: 'info' | 'good' | 'bad' }

interface AppCtx {
  route: Route;
  direction: Direction;
  depth: number;
  go(route: Route, opts?: { replace?: boolean; reset?: boolean; direction?: Direction }): void;
  back(): void;
  setTab(tab: Tab): void;
  session: Session | null;
  sessionReady: boolean;
  refreshSession(): Promise<Session | null>;
  today: TodayInfo | null;
  todayError: string | null;
  refreshToday(): Promise<void>;
  toast(text: string, tone?: Toast['tone']): void;
  toasts: Toast[];
  onboarded: boolean;
  finishOnboarding(): void;
}

const Ctx = createContext<AppCtx | null>(null);

function initialRoute(onboarded: boolean): Route {
  const m = window.location.hash.match(/^#\/join\/([A-Za-z0-9]{4,10})/) ||
    window.location.search.match(/[?&]join=([A-Za-z0-9]{4,10})/);
  if (m) return { name: 'join', code: m[1].toUpperCase() };
  return onboarded ? { name: 'tabs', tab: 'home' } : { name: 'welcome' };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [onboarded, setOnboarded] = useState(() => load('onboarded', false));
  const [stack, setStack] = useState<Route[]>(() => [initialRoute(load('onboarded', false))]);
  const [direction, setDirection] = useState<Direction>('fade');
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const route = stack[stack.length - 1];

  const go: AppCtx['go'] = useCallback((r, opts = {}) => {
    setDirection(opts.direction ?? (opts.reset ? 'fade' : 'push'));
    setStack((s) => (opts.reset ? [r] : opts.replace ? [...s.slice(0, -1), r] : [...s, r]));
    if (!opts.replace && !opts.reset) {
      try { history.pushState({ kikko: true }, ''); } catch { /* noop */ }
    }
  }, []);

  const back = useCallback(() => {
    setDirection('pop');
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'tabs', tab: 'home' }]));
  }, []);

  // No persistent tab bar: Today is the root, sections are pushed on top of it
  // so the back arrow always returns home.
  const setTab = useCallback((tab: Tab) => {
    setStack((s) => {
      const top = s[s.length - 1];
      if (top.name === 'tabs' && top.tab === tab) return s;
      if (tab === 'home') { setDirection('pop'); return [{ name: 'tabs', tab: 'home' }]; }
      setDirection('push');
      try { history.pushState({ kikko: true }, ''); } catch { /* noop */ }
      return [{ name: 'tabs', tab: 'home' }, { name: 'tabs', tab }];
    });
  }, []);

  // Hardware / browser back
  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    const onPop = () => {
      const r = routeRef.current;
      if (r.name === 'play') { history.pushState({ kikko: true }, ''); return; } // no escaping a live game
      back();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [back]);

  const refreshSession = useCallback(async () => {
    try {
      const s = await backend.getSession();
      setSession(s);
      return s;
    } catch {
      setSession(null);
      return null;
    } finally {
      setSessionReady(true);
    }
  }, []);

  const refreshToday = useCallback(async () => {
    if (backend.mode === 'online' && !(await backend.getSession())) {
      // signed-out visitors still see today's challenge; attempt state needs an account
      const { dayKey, dayNumber } = await import('../lib/time');
      const d = dayKey();
      setToday({ day: d, number: dayNumber(d), game: 'odd-spot', serverOffsetMs: 0, attempt: null });
      setTodayError(null);
      return;
    }
    try {
      setToday(await backend.getToday());
      setTodayError(null);
    } catch (e) {
      setTodayError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshSession().then(() => refreshToday());
    return backend.onAuthChange(() => { void refreshSession().then(() => refreshToday()); });
  }, [refreshSession, refreshToday]);

  // roll over to the next challenge at 00:00 UTC while the app is open
  useEffect(() => {
    const id = setInterval(() => {
      if (today && new Date(Date.now() + today.serverOffsetMs).toISOString().slice(0, 10) !== today.day) void refreshToday();
    }, 15_000);
    const onVis = () => { if (document.visibilityState === 'visible') void refreshToday(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [today, refreshToday]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const finishOnboarding = useCallback(() => { save('onboarded', true); setOnboarded(true); }, []);

  const value = useMemo<AppCtx>(() => ({
    route, direction, depth: stack.length, go, back, setTab, session, sessionReady, refreshSession,
    today, todayError, refreshToday, toast, toasts, onboarded, finishOnboarding,
  }), [route, direction, stack.length, go, back, setTab, session, sessionReady, refreshSession, today, todayError, refreshToday, toast, toasts, onboarded, finishOnboarding]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}
