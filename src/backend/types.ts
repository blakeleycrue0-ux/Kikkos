import type { Tap } from '@shared/oddspot.ts';

export type Mode = 'online' | 'demo';

export interface Profile {
  id: string;
  username: string;
  avatarSeed: number;
  createdAt: string;
}

export interface Session {
  userId: string;
  email?: string;
  anonymous?: boolean; // quick-play account tied to this device
  profile: Profile | null; // null = signed in but no username yet
}

export interface TodayInfo {
  day: string; // YYYY-MM-DD (UTC)
  number: number;
  game: string;
  serverOffsetMs: number; // serverNow - clientNow
  attempt: null | {
    status: 'started' | 'scored' | 'rejected';
    score: number;
    correct: number;
    wrong: number;
    startedAt: number;
  };
}

export interface StartedAttempt {
  attemptId: string;
  seed: string;
  startedAt: number; // server ms
  serverOffsetMs: number;
}

export interface AttemptResult {
  score: number;
  correct: number;
  wrong: number;
  rounds: number;
  rank: number | null;
  total: number | null;
  personalBest: boolean;
  verified: boolean; // true when the server replayed and scored it
}

export interface BoardRow {
  rank: number;
  userId: string;
  username: string;
  avatarSeed: number;
  score: number;
  correct: number;
  wrong: number;
  isMe?: boolean;
  sample?: boolean; // explicitly-labelled example data (demo mode only)
}

export interface WorldBoard {
  day: string;
  final: boolean; // false while the day is still running
  total: number;
  top: BoardRow[];
  around: BoardRow[];
  me: BoardRow | null;
  sample: boolean;
}

export interface HistoryItem {
  day: string;
  number: number;
  status: 'started' | 'scored' | 'rejected';
  score: number;
  correct: number;
  wrong: number;
  rank: number | null;
  total: number | null;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  memberCount: number;
  playedToday: number;
}

export interface GroupBoardRow {
  userId: string;
  username: string;
  avatarSeed: number;
  totalScore: number;
  daysPlayed: number;
  best: number;
  isMe?: boolean;
}

export class BackendError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export interface Backend {
  mode: Mode;
  oauthProviders: ('apple' | 'google')[];
  /** Quick play: a real account without email (Supabase anonymous sign-in). */
  quickPlay: boolean;
  emailLogin: boolean;
  signInQuick(): Promise<void>;
  getSession(): Promise<Session | null>;
  onAuthChange(cb: () => void): () => void;
  signInWithOAuth(provider: 'apple' | 'google'): Promise<void>;
  sendEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  createDemoPlayer(username: string): Promise<void>;
  setUsername(username: string): Promise<Profile>;
  signOut(): Promise<void>;

  getToday(): Promise<TodayInfo>;
  startAttempt(): Promise<StartedAttempt>;
  submitAttempt(attemptId: string, taps: Tap[]): Promise<AttemptResult>;

  worldBoard(day: string): Promise<WorldBoard>;
  history(): Promise<HistoryItem[]>;

  myGroups(): Promise<Group[]>;
  createGroup(name: string): Promise<Group>;
  joinGroup(code: string): Promise<Group>;
  leaveGroup(id: string): Promise<void>;
  groupBoard(id: string, from: string, to: string): Promise<GroupBoardRow[]>;

  resetDemo?(): Promise<void>;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
