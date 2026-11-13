import type { Tap } from '@shared/oddspot.ts';
import type { AttemptResult, StartedAttempt } from '../backend';

export type Tab = 'home' | 'world' | 'friends' | 'arcade';

export type Route =
  | { name: 'welcome' }
  | { name: 'onboarding' }
  | { name: 'auth'; reason?: 'play' | 'groups' | 'signin' }
  | { name: 'tabs'; tab: Tab }
  | { name: 'profile' }
  | { name: 'prep' }
  | { name: 'play'; mode: 'daily'; attempt: StartedAttempt }
  | { name: 'play'; mode: 'practice'; seed: string }
  | { name: 'results'; mode: 'daily'; result: AttemptResult | null; error?: string; day: string; number: number; retry?: { attemptId: string; taps: Tap[] } }
  | { name: 'results'; mode: 'practice'; score: number; correct: number; wrong: number; best: boolean; prevBest: number }
  | { name: 'group'; id: string; fresh?: boolean }
  | { name: 'join'; code: string };

export type Direction = 'push' | 'pop' | 'fade' | 'up';
