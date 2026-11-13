/**
 * Local demo backend. Fully playable without a server. Everything is stored on
 * this device, and nothing is server-verified. Any example players are marked
 * `sample: true` and labelled as examples in the UI.
 */
import { createEngine, replay, type Tap } from '@shared/oddspot.ts';
import { load, remove, save } from '../lib/prefs';
import { dayKey, dayNumber } from '../lib/time';
import {
  BackendError, USERNAME_RE, type AttemptResult, type Backend, type BoardRow, type Group,
  type GroupBoardRow, type HistoryItem, type Profile, type Session, type StartedAttempt, type TodayInfo,
} from './types';

interface DemoAttempt {
  id: string;
  day: string;
  seed: string;
  status: 'started' | 'scored' | 'rejected';
  startedAt: number;
  score: number;
  correct: number;
  wrong: number;
  rounds: number;
}
interface DemoGroup { id: string; name: string; code: string; createdAt: number }

const K = { profile: 'demo.profile', attempts: 'demo.attempts', groups: 'demo.groups' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const randomSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

function attempts(): DemoAttempt[] { return load<DemoAttempt[]>(K.attempts, []); }
function saveAttempts(a: DemoAttempt[]) { save(K.attempts, a); }
function profile(): Profile | null { return load<Profile | null>(K.profile, null); }

// Deterministic, clearly-labelled example players so the leaderboard layout can be evaluated.
const SAMPLE_NAMES = ['nova_q', 'pixelrin', 'tomasz', 'aiko.k', 'leo_r', 'mvp_sara', 'duncan', 'yui', 'kofi', 'marta_g', 'zed', 'ilya'];
function sampleRows(day: string): BoardRow[] {
  return SAMPLE_NAMES.map((name, i) => {
    const e = createEngine(`sample:${day}:${name}`);
    // simulate a player of a given skill to produce a plausible tap log
    const skill = 0.55 + ((i * 37) % 40) / 100;
    let t = 0;
    let guard = 0;
    while (t < 30_000 && guard++ < 200) {
      const think = 650 + (1 - skill) * 1800 + ((i * 131 + guard * 71) % 600);
      t = Math.max(t, e.state.roundStart) + think;
      if (t > 30_000) break;
      const miss = (guard * 13 + i * 7) % 11 === 0;
      const cells = e.state.round.size ** 2;
      e.tap(t, miss ? (e.state.round.odd + 1) % cells : e.state.round.odd);
    }
    return {
      rank: 0, userId: `sample-${i}`, username: name, avatarSeed: i * 7919,
      score: e.state.score, correct: e.state.correct, wrong: e.state.wrong, sample: true,
    };
  });
}

export function createDemoBackend(): Backend {
  return {
    mode: 'demo',
    oauthProviders: [],

    async getSession(): Promise<Session | null> {
      const p = profile();
      return p ? { userId: p.id, profile: p } : null;
    },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signInWithOAuth() { throw new BackendError('Sign-in providers need the online server. Demo mode uses a local player.'); },
    async sendEmailCode() { throw new BackendError('Email sign-in needs the online server.'); },
    async verifyEmailCode() { throw new BackendError('Email sign-in needs the online server.'); },
    async createDemoPlayer(username) {
      if (!USERNAME_RE.test(username)) throw new BackendError('3–16 letters, numbers or _');
      const p: Profile = { id: rid(), username, avatarSeed: Math.floor(Math.random() * 1e6), createdAt: new Date().toISOString() };
      save(K.profile, p);
      emit();
    },
    async setUsername(username) {
      if (!USERNAME_RE.test(username)) throw new BackendError('3–16 letters, numbers or _');
      const p = profile();
      if (!p) throw new BackendError('No player');
      const next = { ...p, username };
      save(K.profile, next);
      emit();
      return next;
    },
    async signOut() { remove(K.profile); emit(); },

    async getToday(): Promise<TodayInfo> {
      const day = dayKey();
      const a = attempts().find((x) => x.day === day);
      return {
        day, number: dayNumber(day), game: 'odd-spot', serverOffsetMs: 0,
        attempt: a ? { status: a.status, score: a.score, correct: a.correct, wrong: a.wrong, startedAt: a.startedAt } : null,
      };
    },
    async startAttempt(): Promise<StartedAttempt> {
      if (!profile()) throw new BackendError('Create a player first', 'auth');
      const day = dayKey();
      const all = attempts();
      if (all.some((x) => x.day === day)) throw new BackendError('You already played today', 'already_played');
      const a: DemoAttempt = { id: rid(), day, seed: randomSeed(), status: 'started', startedAt: Date.now(), score: 0, correct: 0, wrong: 0, rounds: 0 };
      saveAttempts([...all, a]);
      return { attemptId: a.id, seed: a.seed, startedAt: a.startedAt, serverOffsetMs: 0 };
    },
    async submitAttempt(attemptId: string, taps: Tap[]): Promise<AttemptResult> {
      const all = attempts();
      const a = all.find((x) => x.id === attemptId);
      if (!a) throw new BackendError('Attempt not found');
      if (a.status !== 'started') throw new BackendError('Already submitted', 'duplicate');
      const r = replay(a.seed, taps);
      const prevBest = Math.max(0, ...all.filter((x) => x.status === 'scored').map((x) => x.score));
      const hadAny = all.some((x) => x.status === 'scored');
      Object.assign(a, r.ok
        ? { status: 'scored', score: r.score, correct: r.correct, wrong: r.wrong, rounds: r.rounds }
        : { status: 'rejected' });
      saveAttempts(all);
      return {
        score: r.score, correct: r.correct, wrong: r.wrong, rounds: r.rounds,
        rank: null, total: null, personalBest: !hadAny || r.score > prevBest, verified: false,
      };
    },

    async worldBoard(day) {
      const p = profile();
      const mine = attempts().find((x) => x.day === day && x.status === 'scored');
      const rows: BoardRow[] = sampleRows(day);
      if (p && mine) rows.push({ rank: 0, userId: p.id, username: p.username, avatarSeed: p.avatarSeed, score: mine.score, correct: mine.correct, wrong: mine.wrong, isMe: true });
      rows.sort((x, y) => y.score - x.score || y.correct - x.correct || x.wrong - y.wrong);
      rows.forEach((r, i) => (r.rank = i + 1));
      const me = rows.find((r) => r.isMe) ?? null;
      const around = me ? rows.slice(Math.max(0, me.rank - 3), me.rank + 2) : [];
      return { day, final: day < dayKey(), total: rows.length, top: rows.slice(0, 10), around, me, sample: true };
    },
    async history(): Promise<HistoryItem[]> {
      return attempts().slice().sort((a, b) => (a.day < b.day ? 1 : -1)).map((a) => ({
        day: a.day, number: dayNumber(a.day), status: a.status, score: a.score, correct: a.correct, wrong: a.wrong, rank: null, total: null,
      }));
    },

    async myGroups(): Promise<Group[]> {
      const played = attempts().some((x) => x.day === dayKey() && x.status === 'scored') ? 1 : 0;
      return load<DemoGroup[]>(K.groups, []).map((g) => ({ id: g.id, name: g.name, code: g.code, memberCount: 1, playedToday: played }));
    },
    async createGroup(name) {
      const n = name.trim();
      if (n.length < 2 || n.length > 32) throw new BackendError('2–32 characters');
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % 32]).join('');
      const g: DemoGroup = { id: rid(), name: n, code, createdAt: Date.now() };
      save(K.groups, [...load<DemoGroup[]>(K.groups, []), g]);
      return { id: g.id, name: g.name, code: g.code, memberCount: 1, playedToday: 0 };
    },
    async joinGroup() {
      throw new BackendError('Joining a friend’s group needs the online server. Demo mode keeps everything on this device.', 'offline');
    },
    async leaveGroup(id) {
      save(K.groups, load<DemoGroup[]>(K.groups, []).filter((g) => g.id !== id));
    },
    async groupBoard(_id, from, to): Promise<GroupBoardRow[]> {
      const p = profile();
      if (!p) return [];
      const mine = attempts().filter((a) => a.status === 'scored' && a.day >= from && a.day <= to);
      return [{
        userId: p.id, username: p.username, avatarSeed: p.avatarSeed, isMe: true,
        totalScore: mine.reduce((s, a) => s + a.score, 0), daysPlayed: mine.length, best: Math.max(0, ...mine.map((a) => a.score)),
      }];
    },
    async resetDemo() {
      remove(K.attempts); remove(K.groups); remove(K.profile); emit();
    },
  };
}

