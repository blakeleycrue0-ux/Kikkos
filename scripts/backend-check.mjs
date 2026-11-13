// End-to-end check of the live Supabase backend.
// Usage: SUPABASE_URL=... SUPABASE_KEY=<publishable> QA_EMAIL_1=... QA_EMAIL_2=... QA_PASSWORD=... node scripts/backend-check.mjs
import { createClient } from '@supabase/supabase-js';
import { createEngine } from '../supabase/functions/_shared/oddspot.ts';

const { SUPABASE_URL: URL, SUPABASE_KEY: KEY, QA_EMAIL_1, QA_EMAIL_2, QA_PASSWORD } = process.env;
let fails = 0;
const ok = (c, m, extra = '') => { console.log(`${c ? '✓' : '✗'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function client(email, name) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password: QA_PASSWORD });
  if (error) throw new Error('sign-in failed: ' + error.message);
  const { error: pErr } = await sb.from('profiles').upsert({ id: (await sb.auth.getUser()).data.user.id, username: name });
  ok(!pErr, `profile created for ${name}`, pErr?.message);
  return sb;
}
async function fn(sb, action, extra = {}) {
  const { data, error } = await sb.functions.invoke('daily', { body: { action, ...extra } });
  if (error) { const body = await error.context?.json?.().catch(() => null); return { status: error.context?.status, body }; }
  return { status: 200, body: data };
}

const NA = process.env.QA_NAME_1 || 'qa_alpha', NB = process.env.QA_NAME_2 || 'qa_bravo';
const a = await client(QA_EMAIL_1, NA);
const b = await client(QA_EMAIL_2, NB);

const today = await fn(a, 'today');
ok(today.status === 200 && today.body.challenge?.day, 'today endpoint returns the daily challenge', today.body?.challenge?.day);
ok(!('seed' in (today.body.challenge ?? {})), 'seed is not exposed before starting');

// A plays a real game: play the actual seed with human-like timing for ~6 s of game time
const startA = await fn(a, 'start');
ok(startA.status === 200 && startA.body.seed, 'A starts an official attempt (server timestamp)');
const eng = createEngine(startA.body.seed);
const taps = []; let t = 0;
for (let i = 0; i < 6; i++) { t = Math.max(t, eng.state.roundStart) + 750; const cell = i === 3 ? (eng.state.round.odd + 1) % eng.state.round.size ** 2 : eng.state.round.odd; if (eng.tap(t, cell).kind !== 'ignored') taps.push({ t, cell }); }
const gameStart = startA.body.startedAt + 3000;
await sleep(Math.max(0, gameStart + t + 300 - startA.body.serverNow));
const subA = await fn(a, 'submit', { attemptId: startA.body.attemptId, taps });
ok(subA.status === 200 && subA.body.score === eng.state.score, 'server replays taps and computes the same score', `score ${subA.body?.score}, rank ${subA.body?.rank}/${subA.body?.total}`);

const again = await fn(a, 'start');
ok(again.status === 409 && again.body?.code === 'already_played', 'second attempt on the same day is refused (unique constraint)');
const dup = await fn(a, 'submit', { attemptId: startA.body.attemptId, taps });
ok(dup.status === 409, 'duplicate submission is refused');

// B tries to cheat: claims 30 s of perfect play right after starting
const startB = await fn(b, 'start');
const fe = createEngine(startB.body.seed); const fake = []; let ft = 0;
while (ft < 29000) { ft = Math.max(ft, fe.state.roundStart) + 150; if (ft > 29000) break; fake.push({ t: ft, cell: fe.state.round.odd }); fe.tap(ft, fe.state.round.odd); }
const subB = await fn(b, 'submit', { attemptId: startB.body.attemptId, taps: fake });
ok(subB.status === 422 && /clock/.test(subB.body?.error ?? ''), 'forged "future" taps are rejected by the server', subB.body?.error);
const bAgain = await fn(b, 'start');
ok(bAgain.status === 409, 'a rejected attempt still uses the daily try');

// RLS
const ins = await b.from('attempts').insert({ user_id: (await b.auth.getUser()).data.user.id, challenge_id: today.body.challenge.id, status: 'scored', score: 99999 });
ok(!!ins.error, 'clients cannot write attempts directly (RLS)', ins.error?.message);
const sec = await b.from('challenge_secrets').select('*');
ok(!sec.error ? sec.data.length === 0 : true, 'challenge seeds are unreadable from the client');
const peek = await b.from('attempts').select('id').neq('user_id', (await b.auth.getUser()).data.user.id);
ok(peek.data?.length === 0, 'users cannot read other players’ attempts');
const anon = createClient(URL, KEY, { auth: { persistSession: false } });
const anonTop = await anon.rpc('world_top', { p_day: today.body.challenge.day });
ok(!!anonTop.error, 'signed-out visitors cannot call leaderboard RPCs');

// Leaderboard
const top = await b.rpc('world_top', { p_day: today.body.challenge.day, p_limit: 10 });
ok(!top.error && top.data.some((r) => r.username === NA) && !top.data.some((r) => r.username === NB), 'world leaderboard shows real verified scores only', JSON.stringify(top.data?.map((r) => [r.rank, r.username, r.score])));
const around = await a.rpc('world_around_me', { p_day: today.body.challenge.day, p_window: 2 });
ok(!around.error && around.data.some((r) => r.username === NA), 'around-me ranking works');

// Groups
const g = await a.rpc('create_group', { p_name: 'QA Rivals' });
ok(!g.error && /^[A-Z2-9]{6}$/.test(g.data?.code), 'group created with invite code', g.data?.code);
const j = await b.rpc('join_group', { p_code: g.data.code });
ok(!j.error, 'friend joins with the code');
const gb = await b.rpc('group_board', { p_group: g.data.id, p_from: today.body.challenge.day, p_to: today.body.challenge.day });
ok(!gb.error && gb.data.length === 2, 'group leaderboard lists both members', JSON.stringify(gb.data?.map((r) => [r.username, r.total_score])));
const hist = await a.rpc('my_history', { p_limit: 5 });
ok(!hist.error && hist.data[0]?.status === 'scored', 'personal history persists');

console.log(fails ? `\n${fails} check(s) failed` : '\nAll backend checks passed');
process.exit(fails ? 1 : 0);
