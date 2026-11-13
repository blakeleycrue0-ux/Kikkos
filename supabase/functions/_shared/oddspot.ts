/**
 * ODD SPOT — shared, dependency-free game engine.
 *
 * This exact file runs in the browser (live gameplay) and in the Supabase Edge
 * Functions (server replay). The server never trusts a client score: it
 * replays the submitted tap log against the seed and recomputes everything.
 */

export const GAME_ID = 'odd-spot';
export const DURATION_MS = 30_000;
export const COUNTDOWN_MS = 3_000;
export const TRANSITION_MS = 240; // pause between a correct tap and the next grid
export const LOCK_MS = 450; // input freeze after a wrong tap
export const MIN_REACTION_MS = 120; // faster taps are ignored (stray / double taps)
export const POINTS_CORRECT = 100;
export const SPEED_BONUS_MAX = 50; // full bonus at <= 800 ms, none at >= 3800 ms
export const SPEED_FULL_MS = 800;
export const SPEED_ZERO_MS = 3_800;
export const PENALTY_WRONG = 40;
export const MAX_TAPS = 400;

export type GlyphId =
  | 'dot' | 'ring' | 'square' | 'squircle' | 'tri' | 'chevron' | 'bolt'
  | 'burst' | 'plus' | 'cross' | 'half' | 'drop' | 'key' | 'arc' | 'ticks' | 'pill';

export type Variation = 'glyph' | 'rotate' | 'mirror' | 'tone' | 'scale';

export interface Look {
  glyph: GlyphId;
  rot: number; // degrees
  flip: boolean;
  scale: number;
  hue: number;
  sat: number;
  light: number;
}

export interface Round {
  index: number;
  size: number; // grid is size × size
  odd: number; // index of the odd cell
  base: Look;
  oddLook: Look;
  variation: Variation;
}

// ───────────────────────────────── RNG ─────────────────────────────────

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

// ─────────────────────────────── Content ───────────────────────────────

/** Glyphs that look different when rotated by 90° / 180°. */
const ROTATABLE: GlyphId[] = ['tri', 'chevron', 'half', 'drop', 'key', 'arc', 'ticks'];
/** Glyphs whose mirror image is distinct. */
const CHIRAL: GlyphId[] = ['bolt', 'key', 'ticks', 'drop'];
/** Clearly different pairs for the opening rounds. */
const EASY_PAIRS: [GlyphId, GlyphId][] = [
  ['dot', 'ring'], ['square', 'dot'], ['tri', 'square'], ['plus', 'cross'],
  ['burst', 'dot'], ['pill', 'square'], ['bolt', 'chevron'], ['half', 'dot'],
];
/** Similar pairs for later rounds. */
const NEAR_PAIRS: [GlyphId, GlyphId][] = [
  ['square', 'squircle'], ['plus', 'cross'], ['dot', 'squircle'], ['arc', 'half'],
  ['ring', 'dot'], ['chevron', 'tri'], ['pill', 'squircle'],
];

/** Brand-derived glyph tones (HSL). */
const TONES: [number, number, number][] = [
  [221, 91, 59], // electric blue
  [16, 100, 69], // coral
  [292, 9, 15], // charcoal
  [226, 72, 42], // deep blue
];

function gridSize(r: number): number {
  if (r < 3) return 3;
  if (r < 7) return 4;
  if (r < 12) return 5;
  return 6;
}

function variationFor(r: number, rnd: () => number): Variation {
  if (r < 3) return 'glyph';
  if (r < 6) return pick(rnd, ['glyph', 'rotate', 'mirror'] as const);
  if (r < 10) return pick(rnd, ['rotate', 'mirror', 'glyph', 'scale'] as const);
  return pick(rnd, ['rotate', 'tone', 'scale', 'glyph', 'mirror'] as const);
}

export function generateRound(seed: string, index: number): Round {
  const rnd = mulberry32(hashString(`${seed}:${index}`));
  const size = gridSize(index);
  const cells = size * size;
  const odd = Math.floor(rnd() * cells);
  let variation = variationFor(index, rnd);
  const [h, s, l] = pick(rnd, TONES);
  const base: Look = { glyph: 'dot', rot: 0, flip: false, scale: 1, hue: h, sat: s, light: l };
  let oddLook: Look = { ...base };

  if (variation === 'glyph') {
    const pair = index < 6 ? pick(rnd, EASY_PAIRS) : pick(rnd, NEAR_PAIRS);
    const swap = rnd() < 0.5;
    base.glyph = swap ? pair[1] : pair[0];
    oddLook = { ...base, glyph: swap ? pair[0] : pair[1] };
  } else if (variation === 'rotate') {
    base.glyph = pick(rnd, ROTATABLE);
    base.rot = pick(rnd, [0, 90, 180, 270]);
    const delta = index < 10 ? pick(rnd, [90, 180, 270]) : pick(rnd, [45, -45, 90]);
    oddLook = { ...base, rot: base.rot + delta };
  } else if (variation === 'mirror') {
    base.glyph = pick(rnd, CHIRAL);
    base.rot = pick(rnd, [0, 90, 180, 270]);
    oddLook = { ...base, flip: true };
  } else if (variation === 'scale') {
    base.glyph = pick(rnd, ['dot', 'square', 'burst', 'plus', 'ring', 'squircle'] as const);
    const shrink = index < 12 ? 0.72 : 0.8;
    oddLook = { ...base, scale: shrink };
  } else {
    // tone: odd one is a lighter shade; gap narrows with progress
    base.glyph = pick(rnd, ['dot', 'square', 'burst', 'squircle', 'pill'] as const);
    base.hue = TONES[0][0];
    base.sat = TONES[0][1];
    base.light = 52;
    const gap = Math.max(9, 18 - (index - 10));
    oddLook = { ...base, light: base.light + gap };
    variation = 'tone';
  }
  return { index, size, odd, base, oddLook, variation };
}

// ─────────────────────────────── Engine ────────────────────────────────

export interface Tap {
  t: number; // ms since game start (after countdown)
  cell: number;
}

export type TapOutcome =
  | { kind: 'correct'; points: number; bonus: number; reaction: number }
  | { kind: 'wrong'; penalty: number }
  | { kind: 'ignored' };

export interface EngineState {
  round: Round;
  roundIndex: number;
  roundStart: number;
  lockUntil: number;
  score: number;
  correct: number;
  wrong: number;
  bestReaction: number | null;
}

export function speedBonus(reaction: number): number {
  if (reaction <= SPEED_FULL_MS) return SPEED_BONUS_MAX;
  if (reaction >= SPEED_ZERO_MS) return 0;
  const k = (SPEED_ZERO_MS - reaction) / (SPEED_ZERO_MS - SPEED_FULL_MS);
  return Math.round(SPEED_BONUS_MAX * k);
}

export function createEngine(seed: string) {
  const state: EngineState = {
    round: generateRound(seed, 0),
    roundIndex: 0,
    roundStart: 0,
    lockUntil: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    bestReaction: null,
  };

  function tap(t: number, cell: number): TapOutcome {
    if (!Number.isFinite(t) || t < 0 || t > DURATION_MS) return { kind: 'ignored' };
    if (t < state.roundStart || t < state.lockUntil) return { kind: 'ignored' };
    const reaction = t - state.roundStart;
    if (reaction < MIN_REACTION_MS) return { kind: 'ignored' };
    const cells = state.round.size * state.round.size;
    if (!Number.isInteger(cell) || cell < 0 || cell >= cells) return { kind: 'ignored' };

    if (cell === state.round.odd) {
      const bonus = speedBonus(reaction);
      const points = POINTS_CORRECT + bonus;
      state.score += points;
      state.correct += 1;
      state.bestReaction = state.bestReaction === null ? reaction : Math.min(state.bestReaction, reaction);
      state.roundIndex += 1;
      state.round = generateRound(seed, state.roundIndex);
      state.roundStart = t + TRANSITION_MS;
      return { kind: 'correct', points, bonus, reaction };
    }
    state.score = Math.max(0, state.score - PENALTY_WRONG);
    state.wrong += 1;
    state.lockUntil = t + LOCK_MS;
    return { kind: 'wrong', penalty: PENALTY_WRONG };
  }

  return { state, tap };
}

export interface ReplayResult {
  ok: boolean;
  reason?: string;
  score: number;
  correct: number;
  wrong: number;
  rounds: number;
  bestReaction: number | null;
}

/** Server-side authoritative replay of a tap log. */
export function replay(seed: string, taps: unknown): ReplayResult {
  const fail = (reason: string): ReplayResult => ({
    ok: false, reason, score: 0, correct: 0, wrong: 0, rounds: 0, bestReaction: null,
  });
  if (!Array.isArray(taps)) return fail('taps must be an array');
  if (taps.length > MAX_TAPS) return fail('too many taps');
  const engine = createEngine(seed);
  let last = -1;
  for (const raw of taps) {
    if (!raw || typeof raw !== 'object') return fail('malformed tap');
    const { t, cell } = raw as Tap;
    if (typeof t !== 'number' || typeof cell !== 'number') return fail('malformed tap');
    if (t < last) return fail('taps out of order');
    if (t > DURATION_MS + 50) return fail('tap after time limit');
    last = t;
    engine.tap(Math.min(t, DURATION_MS), cell);
  }
  const s = engine.state;
  return { ok: true, score: s.score, correct: s.correct, wrong: s.wrong, rounds: s.roundIndex, bestReaction: s.bestReaction };
}

/** Ranking order: score ↓, correct ↓, wrong ↑, earlier submission ↑. */
export const TIE_BREAK_DOC =
  'Higher score wins. Ties: more correct finds, then fewer wrong taps, then whoever submitted first.';
