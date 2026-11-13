// Sanity checks for the shared Odd Spot engine. Run: npm run test:engine
import { createEngine, generateRound, replay, DURATION_MS, MIN_REACTION_MS } from '../supabase/functions/_shared/oddspot.ts';

let fail = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fail++; console.error('✗', msg); } else console.log('✓', msg); };

// determinism
ok(JSON.stringify(generateRound('abc', 7)) === JSON.stringify(generateRound('abc', 7)), 'rounds are deterministic');
ok(JSON.stringify(generateRound('abc', 7)) !== JSON.stringify(generateRound('abd', 7)), 'different seeds give different rounds');

// every round has a visually distinct odd look
let identical = 0;
for (let s = 0; s < 200; s++) for (let r = 0; r < 30; r++) {
  const rd = generateRound('seed' + s, r);
  if (JSON.stringify(rd.base) === JSON.stringify(rd.oddLook)) identical++;
  if (rd.odd < 0 || rd.odd >= rd.size * rd.size) identical++;
}
ok(identical === 0, 'odd cell always differs and is in range (6000 rounds)');

// simulate a perfect-ish player and verify replay matches live engine
const seed = 'test-seed';
const live = createEngine(seed);
const taps: { t: number; cell: number }[] = [];
let t = 0;
for (let i = 0; i < 60; i++) {
  t = Math.max(t, live.state.roundStart) + 700 + (i % 5) * 120;
  if (t > DURATION_MS) break;
  const cell = i % 7 === 3 ? (live.state.round.odd + 1) % (live.state.round.size ** 2) : live.state.round.odd;
  const out = live.tap(t, cell);
  if (out.kind !== 'ignored') taps.push({ t, cell });
}
const r = replay(seed, taps);
ok(r.ok && r.score === live.state.score && r.correct === live.state.correct, `replay matches live (score ${r.score}, ${r.correct} found, ${r.wrong} wrong)`);

// cheating attempts
ok(!replay(seed, [{ t: 500, cell: 0 }, { t: 100, cell: 0 }]).ok, 'out-of-order taps rejected');
ok(!replay(seed, [{ t: DURATION_MS + 5000, cell: 0 }]).ok, 'taps after time limit rejected');
ok(!replay(seed, 'nope').ok, 'malformed payload rejected');
const fast = createEngine(seed);
ok(fast.tap(MIN_REACTION_MS - 1, fast.state.round.odd).kind === 'ignored', 'inhumanly fast taps ignored');
const forged = replay(seed, [{ t: 300, cell: 99 }]);
ok(forged.ok && forged.score === 0, 'out-of-range cells score nothing');

process.exit(fail ? 1 : 0);
