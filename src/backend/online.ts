/** Supabase-backed backend. Scores are created and verified by the `daily` edge function. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Tap } from '@shared/oddspot.ts';
import { OAUTH_PROVIDERS, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/config';
import { dayKey } from '../lib/time';
import {
  BackendError, USERNAME_RE, type AttemptResult, type Backend, type BoardRow, type Group, type GroupBoardRow,
  type HistoryItem, type Profile, type Session, type StartedAttempt, type TodayInfo, type WorldBoard,
} from './types';

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export function createOnlineBackend(opts: { quickPlay: boolean; emailLogin: boolean }): Backend {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce',
      // The default navigator.locks implementation can deadlock when auth calls overlap
      // (e.g. during start-up); a pass-through lock keeps every call responsive.
      lock: async <R>(_name: string, _timeout: number, fn: () => Promise<R>) => fn(),
    },
  });

  async function uid(): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new BackendError('Sign in to continue', 'auth');
    return id;
  }

  /** Calls the `daily` edge function directly with the user's access token. */
  async function call<T>(action: string, extra: Row = {}): Promise<T> {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new BackendError('Sign in to continue', 'auth');
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...extra }),
      });
    } catch {
      throw new BackendError('Network error. Check your connection and try again.');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new BackendError(body?.error ?? `Server error (${res.status})`, body?.code);
    return body as T;
  }

  const toProfile = (r: Row): Profile => ({
    id: String(r.id), username: String(r.username), avatarSeed: num(r.avatar_seed), createdAt: String(r.created_at),
  });
  const toRow = (r: Row, me: string): BoardRow => ({
    rank: num(r.rank), userId: String(r.user_id), username: String(r.username), avatarSeed: num(r.avatar_seed),
    score: num(r.score), correct: num(r.correct), wrong: num(r.wrong), isMe: r.user_id === me,
  });

  return {
    mode: 'online',
    oauthProviders: OAUTH_PROVIDERS,
    quickPlay: opts.quickPlay,
    emailLogin: opts.emailLogin,
    async signInQuick() {
      const { error } = await sb.auth.signInAnonymously();
      if (error) throw new BackendError(error.message);
    },

    async getSession(): Promise<Session | null> {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      return { userId: user.id, email: user.email, anonymous: !!user.is_anonymous, profile: p ? toProfile(p) : null };
    },
    onAuthChange(cb) {
      // Defer: calling Supabase inside this callback deadlocks its auth lock.
      const { data } = sb.auth.onAuthStateChange(() => { setTimeout(cb, 0); });
      return () => data.subscription.unsubscribe();
    },
    async signInWithOAuth(provider) {
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      if (error) throw new BackendError(error.message);
    },
    async sendEmailCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
      if (error) throw new BackendError(error.message);
    },
    async verifyEmailCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw new BackendError(error.message);
    },
    async createDemoPlayer() { throw new BackendError('Not available online'); },
    async setUsername(username) {
      if (!USERNAME_RE.test(username)) throw new BackendError('3–16 letters, numbers or _');
      const id = await uid();
      const { data, error } = await sb.from('profiles').upsert({ id, username }).select('*').single();
      if (error) throw new BackendError(error.code === '23505' ? 'That name is taken' : error.message);
      return toProfile(data);
    },
    async signOut() { await sb.auth.signOut(); },

    async getToday(): Promise<TodayInfo> {
      const t0 = Date.now();
      const { data, error } = await sb.rpc('my_today');
      if (error) throw new BackendError(error.message.includes('sign in') ? 'Sign in to continue' : 'Could not reach the server', 'network');
      const r = data as { challenge: Row; attempt: Row | null; serverNow: number };
      const rtt = Date.now() - t0;
      const a = r.attempt;
      return {
        day: String(r.challenge.day), number: num(r.challenge.number), game: String(r.challenge.game),
        serverOffsetMs: r.serverNow + rtt / 2 - Date.now(),
        attempt: a ? {
          status: a.status as 'started', score: num(a.score), correct: num(a.correct), wrong: num(a.wrong),
          startedAt: Date.parse(String(a.started_at)),
        } : null,
      };
    },
    async startAttempt(): Promise<StartedAttempt> {
      const t0 = Date.now();
      const r = await call<{ attemptId: string; seed: string; startedAt: number; serverNow: number }>('start');
      const rtt = Date.now() - t0;
      return { attemptId: r.attemptId, seed: r.seed, startedAt: r.startedAt, serverOffsetMs: r.serverNow + rtt / 2 - Date.now() };
    },
    async submitAttempt(attemptId: string, taps: Tap[]): Promise<AttemptResult> {
      const r = await call<Omit<AttemptResult, 'verified'>>('submit', { attemptId, taps });
      return { ...r, rank: r.rank === null ? null : num(r.rank), total: r.total === null ? null : num(r.total), verified: true };
    },

    async worldBoard(day): Promise<WorldBoard> {
      const me = await uid().catch(() => '');
      const [top, around] = await Promise.all([
        sb.rpc('world_top', { p_day: day, p_limit: 50 }),
        me ? sb.rpc('world_around_me', { p_day: day, p_window: 2 }) : Promise.resolve({ data: [], error: null }),
      ]);
      if (top.error) throw new BackendError('Could not load the leaderboard');
      const topRows = (top.data as Row[]).map((r) => toRow(r, me));
      const aroundRows = ((around.data as Row[]) ?? []).map((r) => toRow(r, me));
      const meRow = aroundRows.find((r) => r.isMe) ?? topRows.find((r) => r.isMe) ?? null;
      const total = num((top.data as Row[])[0]?.total);
      return { day, final: day < dayKey(), total, top: topRows, around: aroundRows, me: meRow, sample: false };
    },
    async history(): Promise<HistoryItem[]> {
      const { data, error } = await sb.rpc('my_history', { p_limit: 30 });
      if (error) throw new BackendError('Could not load history');
      return (data as Row[]).map((r) => ({
        day: String(r.day), number: num(r.number), status: r.status as 'scored', score: num(r.score),
        correct: num(r.correct), wrong: num(r.wrong), rank: r.rank === null ? null : num(r.rank), total: r.total === null ? null : num(r.total),
      }));
    },

    async myGroups(): Promise<Group[]> {
      const { data, error } = await sb.rpc('my_groups');
      if (error) throw new BackendError('Could not load groups');
      return (data as Row[]).map((r) => ({
        id: String(r.id), name: String(r.name), code: String(r.code), memberCount: num(r.member_count), playedToday: num(r.played_today),
      }));
    },
    async createGroup(name) {
      const { data, error } = await sb.rpc('create_group', { p_name: name });
      if (error) throw new BackendError(error.message);
      const g = data as Row;
      return { id: String(g.id), name: String(g.name), code: String(g.code), memberCount: 1, playedToday: 0 };
    },
    async joinGroup(code) {
      const { data, error } = await sb.rpc('join_group', { p_code: code });
      if (error) throw new BackendError(error.message.includes('invalid code') ? 'No group with that code' : error.message);
      const g = data as Row;
      return { id: String(g.id), name: String(g.name), code: String(g.code), memberCount: 0, playedToday: 0 };
    },
    async leaveGroup(id) {
      const me = await uid();
      const { error } = await sb.from('group_members').delete().eq('group_id', id).eq('user_id', me);
      if (error) throw new BackendError('Could not leave the group');
    },
    async groupBoard(id, from, to): Promise<GroupBoardRow[]> {
      const me = await uid().catch(() => '');
      const { data, error } = await sb.rpc('group_board', { p_group: id, p_from: from, p_to: to });
      if (error) throw new BackendError('Could not load the group');
      return (data as Row[]).map((r) => ({
        userId: String(r.user_id), username: String(r.username), avatarSeed: num(r.avatar_seed),
        totalScore: num(r.total_score), daysPlayed: num(r.days_played), best: num(r.best), isMe: r.user_id === me,
      }));
    },
  };
}
