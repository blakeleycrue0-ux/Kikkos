// KIKKO — daily challenge edge function (Deno).
// POST { action: 'today' | 'start' | 'submit', attemptId?, taps? }
// Uses the service role key server-side only. The browser never sees it.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { COUNTDOWN_MS, DURATION_MS, replay } from '../_shared/oddspot.ts';

const SUBMIT_GRACE_MS = 10_000;
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'sign in required' }, 401);

  let body: { action?: string; attemptId?: string; taps?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const { data: challenge, error: cErr } = await admin.rpc('ensure_today');
  if (cErr || !challenge) return json({ error: 'could not load today' }, 500);
  const now = Date.now();

  const { data: profile } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();

  if (body.action === 'today') {
    const { data: attempt } = await admin.from('attempts')
      .select('id,status,score,correct,wrong,rounds,started_at,submitted_at')
      .eq('user_id', user.id).eq('challenge_id', challenge.id).maybeSingle();
    return json({ challenge, attempt, serverNow: now, hasProfile: !!profile });
  }

  if (body.action === 'start') {
    if (!profile) return json({ error: 'create a username first' }, 400);
    const { data: limited } = await admin.rpc('hit_rate_limit',
      { p_user: user.id, p_action: 'start', p_max: 10, p_window: '1 minute' });
    if (limited) return json({ error: 'slow down a little and try again' }, 429);
    const { data: attempt, error } = await admin.from('attempts')
      .insert({ user_id: user.id, challenge_id: challenge.id })
      .select('id,started_at').single();
    if (error) {
      if (error.code === '23505') return json({ error: 'already played today', code: 'already_played' }, 409);
      return json({ error: 'could not start attempt' }, 500);
    }
    const { data: secret } = await admin.from('challenge_secrets').select('seed').eq('challenge_id', challenge.id).single();
    return json({
      attemptId: attempt.id,
      seed: secret!.seed,
      startedAt: new Date(attempt.started_at).getTime(),
      serverNow: now,
      countdownMs: COUNTDOWN_MS,
      durationMs: DURATION_MS,
    });
  }

  if (body.action === 'submit') {
    const { data: limited } = await admin.rpc('hit_rate_limit',
      { p_user: user.id, p_action: 'submit', p_max: 10, p_window: '1 minute' });
    if (limited) return json({ error: 'slow down a little and try again' }, 429);
    const { data: attempt } = await admin.from('attempts').select('*')
      .eq('id', body.attemptId ?? '').eq('user_id', user.id).maybeSingle();
    if (!attempt) return json({ error: 'attempt not found' }, 404);
    if (attempt.status !== 'started') return json({ error: 'already submitted', code: 'duplicate' }, 409);

    const startedAt = new Date(attempt.started_at).getTime();
    const gameStart = startedAt + COUNTDOWN_MS;
    const { data: secret } = await admin.from('challenge_secrets').select('seed').eq('challenge_id', attempt.challenge_id).single();
    let result = replay(secret!.seed, body.taps);

    if (now > gameStart + DURATION_MS + SUBMIT_GRACE_MS) result = { ...result, ok: false, reason: 'submitted too late' };
    if (result.ok && Array.isArray(body.taps) && body.taps.length) {
      const lastT = (body.taps[body.taps.length - 1] as { t: number }).t;
      // taps cannot claim to have happened in the future relative to the server clock
      if (gameStart + lastT > now + 2_000) result = { ...result, ok: false, reason: 'clock mismatch' };
    }

    const update = result.ok
      ? { status: 'scored', score: result.score, correct: result.correct, wrong: result.wrong,
          rounds: result.rounds, best_reaction_ms: result.bestReaction, taps: body.taps, submitted_at: new Date(now).toISOString() }
      : { status: 'rejected', reject_reason: result.reason, submitted_at: new Date(now).toISOString() };
    // conditional update guards against a duplicate concurrent submit
    const { data: updated } = await admin.from('attempts').update(update)
      .eq('id', attempt.id).eq('status', 'started').select('id');
    if (!updated?.length) return json({ error: 'already submitted', code: 'duplicate' }, 409);
    if (!result.ok) return json({ error: `attempt rejected: ${result.reason}`, code: 'rejected' }, 422);

    const { data: around } = await admin.from('ranked_attempts').select('rank,total')
      .eq('challenge_id', attempt.challenge_id).eq('user_id', user.id).maybeSingle();
    const { data: best } = await admin.from('attempts').select('score')
      .eq('user_id', user.id).eq('status', 'scored').neq('id', attempt.id)
      .order('score', { ascending: false }).limit(1).maybeSingle();
    return json({
      score: result.score, correct: result.correct, wrong: result.wrong, rounds: result.rounds,
      rank: around?.rank ?? null, total: around?.total ?? null,
      personalBest: !best || result.score > best.score,
    });
  }

  return json({ error: 'unknown action' }, 400);
});
