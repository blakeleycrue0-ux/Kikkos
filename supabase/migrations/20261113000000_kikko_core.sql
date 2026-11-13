-- KIKKO core schema
-- Daily challenges, one official attempt per user per day, world + group leaderboards.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── Profiles ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  avatar_seed int not null default floor(random() * 1000000)::int,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users create their own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- ────────────────────────── Daily challenges ─────────────────────────
create table public.daily_challenges (
  id bigint generated always as identity primary key,
  day date not null unique,
  game text not null default 'odd-spot',
  number int not null,
  duration_ms int not null default 30000,
  created_at timestamptz not null default now()
);
alter table public.daily_challenges enable row level security;
create policy "challenges are public" on public.daily_challenges for select using (true);

-- Seeds live in a table no client role can read.
create table public.challenge_secrets (
  challenge_id bigint primary key references public.daily_challenges(id) on delete cascade,
  seed text not null
);
alter table public.challenge_secrets enable row level security;
-- (no policies: only the service role can read/write)

-- ───────────────────────────── Attempts ─────────────────────────────
create type public.attempt_status as enum ('started', 'scored', 'rejected');

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id bigint not null references public.daily_challenges(id) on delete cascade,
  status public.attempt_status not null default 'started',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score int not null default 0,
  correct int not null default 0,
  wrong int not null default 0,
  rounds int not null default 0,
  best_reaction_ms int,
  taps jsonb,
  reject_reason text,
  -- the fairness guarantee: one official attempt per account per day
  constraint one_attempt_per_day unique (user_id, challenge_id)
);
create index attempts_rank_idx on public.attempts (challenge_id, score desc, correct desc, wrong asc, submitted_at asc)
  where status = 'scored';
alter table public.attempts enable row level security;
create policy "users read their own attempts" on public.attempts
  for select to authenticated using (auth.uid() = user_id);
-- no insert/update policies: attempts are written only by edge functions (service role)

-- ───────────────────────────── Groups ───────────────────────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 32),
  code text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create or replace function public.is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid());
$$;

create policy "members read their groups" on public.groups
  for select to authenticated using (public.is_member(id));
create policy "members read co-members" on public.group_members
  for select to authenticated using (public.is_member(group_id));
create policy "members can leave" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- ─────────────────────────── Rate limiting ───────────────────────────
create table public.request_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  at timestamptz not null default now()
);
create index request_log_idx on public.request_log (user_id, action, at desc);
alter table public.request_log enable row level security;

create or replace function public.hit_rate_limit(p_user uuid, p_action text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from request_log where at < now() - interval '1 day';
  select count(*) into n from request_log where user_id = p_user and action = p_action and at > now() - p_window;
  if n >= p_max then return true; end if;
  insert into request_log (user_id, action) values (p_user, p_action);
  return false;
end $$;
revoke all on function public.hit_rate_limit from public, anon, authenticated;
grant execute on function public.hit_rate_limit to service_role;

-- ─────────────────────────── Helper: today ───────────────────────────
-- The daily challenge flips at 00:00 UTC for everyone.
create or replace function public.ensure_today() returns public.daily_challenges
language plpgsql security definer set search_path = public as $$
declare c daily_challenges; d date := (now() at time zone 'utc')::date;
begin
  select * into c from daily_challenges where day = d;
  if found then return c; end if;
  insert into daily_challenges (day, number)
    values (d, (d - date '2026-11-01') + 1)
    on conflict (day) do nothing;
  select * into c from daily_challenges where day = d;
  insert into challenge_secrets (challenge_id, seed)
    values (c.id, encode(extensions.gen_random_bytes(18), 'hex'))
    on conflict do nothing;
  return c;
end $$;
revoke all on function public.ensure_today from public, anon, authenticated;
grant execute on function public.ensure_today to service_role;

create or replace function public.server_now() returns timestamptz language sql stable set search_path = public as $$ select now() $$;

-- ───────────────────────── Leaderboards (RPC) ─────────────────────────
create or replace view public.ranked_attempts with (security_invoker = false) as
  select a.challenge_id, c.day, a.user_id, p.username, p.avatar_seed,
         a.score, a.correct, a.wrong, a.submitted_at,
         row_number() over (partition by a.challenge_id
           order by a.score desc, a.correct desc, a.wrong asc, a.submitted_at asc) as rank,
         count(*) over (partition by a.challenge_id) as total
  from attempts a
  join profiles p on p.id = a.user_id
  join daily_challenges c on c.id = a.challenge_id
  where a.status = 'scored';
revoke all on public.ranked_attempts from anon, authenticated;
grant select on public.ranked_attempts to service_role;

create or replace function public.world_top(p_day date, p_limit int default 50)
returns table (rank bigint, user_id uuid, username text, avatar_seed int, score int, correct int, wrong int, total bigint)
language sql stable security definer set search_path = public as $$
  select rank, user_id, username, avatar_seed, score, correct, wrong, total
  from ranked_attempts where day = p_day order by rank limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.world_around_me(p_day date, p_window int default 3)
returns table (rank bigint, user_id uuid, username text, avatar_seed int, score int, correct int, wrong int, total bigint)
language sql stable security definer set search_path = public as $$
  with me as (select rank from ranked_attempts where day = p_day and user_id = auth.uid())
  select r.rank, r.user_id, r.username, r.avatar_seed, r.score, r.correct, r.wrong, r.total
  from ranked_attempts r, me
  where r.day = p_day and r.rank between me.rank - least(p_window, 10) and me.rank + least(p_window, 10)
  order by r.rank;
$$;

create or replace function public.group_board(p_group uuid, p_from date, p_to date)
returns table (user_id uuid, username text, avatar_seed int, total_score bigint, days_played bigint, best int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_group) then raise exception 'not a member'; end if;
  return query
    select m.user_id, p.username, p.avatar_seed,
           coalesce(sum(a.score) filter (where a.status = 'scored'), 0)::bigint,
           count(a.id) filter (where a.status = 'scored'),
           coalesce(max(a.score) filter (where a.status = 'scored'), 0)
    from group_members m
    join profiles p on p.id = m.user_id
    left join attempts a on a.user_id = m.user_id
      and a.challenge_id in (select id from daily_challenges where day between p_from and p_to)
    where m.group_id = p_group
    group by m.user_id, p.username, p.avatar_seed
    order by 4 desc, 5 desc, p.username;
end $$;

create or replace function public.my_groups()
returns table (id uuid, name text, code text, member_count bigint, played_today bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.code,
         (select count(*) from group_members m where m.group_id = g.id),
         (select count(*) from group_members m join attempts a on a.user_id = m.user_id
            join daily_challenges c on c.id = a.challenge_id
            where m.group_id = g.id and a.status = 'scored' and c.day = (now() at time zone 'utc')::date),
         g.created_at
  from groups g join group_members gm on gm.group_id = g.id and gm.user_id = auth.uid()
  order by g.created_at;
$$;

create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g groups; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if (select count(*) from group_members where user_id = auth.uid()) >= 20 then
    raise exception 'group limit reached';
  end if;
  loop
    -- unambiguous alphabet (no 0/O/1/I)
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
          from generate_series(1, 6));
    begin
      insert into groups (name, code, owner_id) values (trim(p_name), c, auth.uid()) returning * into g;
      exit;
    exception when unique_violation then
      tries := tries + 1; if tries > 5 then raise; end if;
    end;
  end loop;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if hit_rate_limit(auth.uid(), 'join_group', 10, interval '10 minutes') then
    raise exception 'too many attempts, try again later';
  end if;
  select * into g from groups where code = upper(trim(p_code));
  if not found then raise exception 'invalid code'; end if;
  if (select count(*) from group_members where group_id = g.id) >= 50 then
    raise exception 'group is full';
  end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

create or replace function public.my_history(p_limit int default 14)
returns table (day date, number int, status public.attempt_status, score int, correct int, wrong int, rank bigint, total bigint)
language sql stable security definer set search_path = public as $$
  select c.day, c.number, a.status, a.score, a.correct, a.wrong, r.rank, r.total
  from attempts a
  join daily_challenges c on c.id = a.challenge_id
  left join ranked_attempts r on r.challenge_id = a.challenge_id and r.user_id = a.user_id
  where a.user_id = auth.uid()
  order by c.day desc limit least(p_limit, 60);
$$;

-- Functions are executable by PUBLIC by default: lock them to signed-in users only.
revoke execute on function public.world_top, public.world_around_me, public.group_board,
  public.my_groups, public.create_group, public.join_group, public.my_history, public.server_now,
  public.is_member
  from public, anon;
grant execute on function public.world_top, public.world_around_me, public.group_board,
  public.my_groups, public.create_group, public.join_group, public.my_history, public.server_now,
  public.is_member
  to authenticated;
