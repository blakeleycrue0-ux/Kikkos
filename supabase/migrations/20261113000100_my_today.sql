-- One round trip for the home screen: today's challenge, my attempt and the server clock.
create or replace function public.my_today() returns jsonb
language plpgsql security definer set search_path = public as $$
declare c daily_challenges; a attempts;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  c := ensure_today();
  select * into a from attempts where user_id = auth.uid() and challenge_id = c.id;
  return jsonb_build_object(
    'challenge', jsonb_build_object('id', c.id, 'day', c.day, 'number', c.number, 'game', c.game),
    'attempt', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'status', a.status, 'score', a.score, 'correct', a.correct, 'wrong', a.wrong,
      'started_at', a.started_at, 'submitted_at', a.submitted_at) end,
    'serverNow', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );
end $$;
revoke execute on function public.my_today from public, anon;
grant execute on function public.my_today to authenticated;
