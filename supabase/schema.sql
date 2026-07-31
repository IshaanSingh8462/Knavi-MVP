-- ============================================================================
-- Quest — Supabase schema, Row Level Security policies, and helper functions
-- ============================================================================
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / ADD
-- COLUMN IF NOT EXISTS, so you can paste this again after edits without
-- losing data — including if you already ran an earlier version of this
-- file and are just picking up the new `depth` / `parent_level_id` columns
-- added for the node "Break Down Further" feature.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.activities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name              text not null check (char_length(trim(name)) > 0),
  type              text not null check (type in ('sport', 'music', 'creative', 'other')),
  days_of_week      text[] not null default '{}',
  start_time        text not null,
  duration_minutes  integer not null check (duration_minutes > 0),
  created_at        timestamptz not null default now()
);

create table if not exists public.weekly_plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start_date  date not null,
  goal             text,
  raw_ai_output    jsonb,
  status           text not null default 'active' check (status in ('draft', 'active', 'complete')),
  created_at       timestamptz not null default now()
);

create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id            uuid not null references public.weekly_plans(id) on delete cascade,
  title              text not null,
  subject            text,
  due_date           date,
  branch             text not null check (branch in ('academic', 'activity', 'light', 'custom')),
  estimated_minutes  integer,
  is_public          boolean not null default false,
  author_name        text,
  created_at         timestamptz not null default now()
);

alter table public.tasks add column if not exists is_public boolean not null default false;
alter table public.tasks add column if not exists author_name text;

create table if not exists public.levels (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id            uuid references public.tasks(id) on delete cascade,
  title              text not null,
  description        text,
  estimated_minutes  integer not null check (estimated_minutes between 20 and 30),
  branch             text not null check (branch in ('academic', 'activity', 'light', 'custom')),
  branch_order       integer not null default 0,
  status             text not null default 'locked' check (status in ('locked', 'active', 'complete')),
  skipped            boolean not null default false,
  completed_at       timestamptz,
  created_at         timestamptz not null default now()
);

-- Node "Break Down Further" support. depth 0 = an original trail node.
-- depth 1+ = inserted into the trail by breaking a node down further.
-- parent_level_id records which node it came from (used only to cap repeat
-- breakdowns and to detect "already broken down" — NOT for trail layout;
-- broken-down nodes are inserted directly into the same flat sequence,
-- there's no branching in the trail itself).
alter table public.levels add column if not exists depth integer not null default 0;
alter table public.levels add column if not exists parent_level_id uuid references public.levels(id) on delete cascade;

create table if not exists public.streaks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
  streak_count      integer not null default 0,
  last_active_date  date,
  longest_streak    integer not null default 0
);

create table if not exists public.ai_rate_limits (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  usage_date     date not null default current_date,
  request_count  integer not null default 0,
  primary key (user_id, usage_date)
);

create index if not exists idx_activities_user on public.activities(user_id);
create index if not exists idx_weekly_plans_user_status on public.weekly_plans(user_id, status);
create index if not exists idx_tasks_user_plan on public.tasks(user_id, plan_id);
create index if not exists idx_levels_user on public.levels(user_id);
create index if not exists idx_levels_task on public.levels(task_id);
create index if not exists idx_levels_parent on public.levels(parent_level_id);

alter table public.activities     enable row level security;
alter table public.weekly_plans   enable row level security;
alter table public.tasks          enable row level security;
alter table public.levels         enable row level security;
alter table public.streaks        enable row level security;
alter table public.ai_rate_limits enable row level security;

drop policy if exists "owner full access" on public.activities;
create policy "owner full access" on public.activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner full access" on public.weekly_plans;
create policy "owner full access" on public.weekly_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner full access" on public.tasks;
create policy "owner full access" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anyone signed in — including a guest via anonymous auth, which still
-- carries a real (temporary) auth.uid() and the 'authenticated' role — can
-- read a task once its owner has flipped it public. This is additive to
-- the owner policy above; Postgres OR's permissive policies together, so
-- it never weakens the owner-only guarantee for private tasks.
drop policy if exists "public read published tasks" on public.tasks;
create policy "public read published tasks" on public.tasks
  for select using (is_public = true);

drop policy if exists "owner full access" on public.levels;
create policy "owner full access" on public.levels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public read published task levels" on public.levels;
create policy "public read published task levels" on public.levels
  for select using (
    task_id is not null and exists (
      select 1 from public.tasks t where t.id = levels.task_id and t.is_public = true
    )
  );

drop policy if exists "owner full access" on public.streaks;
create policy "owner full access" on public.streaks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner full access" on public.ai_rate_limits;
create policy "owner full access" on public.ai_rate_limits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.streaks (user_id, streak_count, last_active_date, longest_streak)
  values (new.id, 0, null, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.complete_level(p_level_id uuid, p_skipped boolean default false)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_level  public.levels%rowtype;
  v_next   public.levels%rowtype;
  v_streak public.streaks%rowtype;
  v_today  date := current_date;
  v_diff   integer;
  v_has_next boolean := false;
begin
  select * into v_level from public.levels where id = p_level_id and user_id = auth.uid();
  if not found then
    raise exception 'Level not found';
  end if;

  update public.levels
    set status = 'complete', skipped = p_skipped, completed_at = now()
    where id = p_level_id
    returning * into v_level;

  select * into v_next
    from public.levels
    where user_id = auth.uid()
      and branch = v_level.branch
      and branch_order = v_level.branch_order + 1
      and status = 'locked'
      and (v_level.branch <> 'custom' or task_id is not distinct from v_level.task_id)
    limit 1;

  if found then
    v_has_next := true;
    update public.levels set status = 'active' where id = v_next.id returning * into v_next;
  end if;

  select * into v_streak from public.streaks where user_id = auth.uid();
  if not found then
    insert into public.streaks (user_id, streak_count, last_active_date, longest_streak)
    values (auth.uid(), 0, null, 0)
    returning * into v_streak;
  end if;

  if v_streak.last_active_date is null then
    v_streak.streak_count := 1;
  elsif v_streak.last_active_date = v_today then
    null;
  else
    v_diff := v_today - v_streak.last_active_date;
    if v_diff <= 1 then
      v_streak.streak_count := v_streak.streak_count + 1;
    else
      v_streak.streak_count := 1;
    end if;
  end if;
  v_streak.last_active_date := v_today;

  if v_streak.streak_count > v_streak.longest_streak then
    v_streak.longest_streak := v_streak.streak_count;
  end if;

  update public.streaks
    set streak_count = v_streak.streak_count,
        last_active_date = v_streak.last_active_date,
        longest_streak = v_streak.longest_streak
    where user_id = auth.uid();

  return jsonb_build_object(
    'completedLevel', to_jsonb(v_level),
    'nextUnlockedLevel', case when v_has_next then to_jsonb(v_next) else null end,
    'streak', to_jsonb(v_streak)
  );
end;
$$;

create or replace function public.check_and_increment_ai_rate_limit(p_limit integer default 10)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_count integer;
begin
  insert into public.ai_rate_limits (user_id, usage_date, request_count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, usage_date)
  do update set request_count = public.ai_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.activities,
  public.weekly_plans,
  public.tasks,
  public.levels,
  public.streaks,
  public.ai_rate_limits
to authenticated;

create or replace function public.revert_level_completion(p_level_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_level public.levels%rowtype;
  v_next  public.levels%rowtype;
  v_has_next boolean := false;
begin
  select * into v_level from public.levels where id = p_level_id and user_id = auth.uid();
  if not found then
    raise exception 'Step not found';
  end if;
  if v_level.status <> 'complete' then
    raise exception 'Only a completed step can be undone';
  end if;

  select * into v_next
    from public.levels
    where user_id = auth.uid()
      and branch = v_level.branch
      and branch_order = v_level.branch_order + 1
      and (v_level.branch <> 'custom' or task_id is not distinct from v_level.task_id)
    limit 1;

  if found then
    v_has_next := true;
    -- Only safe to undo if nothing past this step has been touched yet —
    -- otherwise re-locking would need to cascade through everything after
    -- it, which risks silently discarding real progress.
    if v_next.status <> 'active' then
      raise exception 'Can only undo the most recently completed step on this trail.';
    end if;
    update public.levels set status = 'locked' where id = v_next.id;
  end if;

  update public.levels
    set status = 'active', skipped = false, completed_at = null
    where id = p_level_id
    returning * into v_level;

  return jsonb_build_object('revertedLevel', to_jsonb(v_level), 'relockedNext', v_has_next);
end;
$$;

grant execute on function public.complete_level(uuid, boolean) to authenticated;
grant execute on function public.check_and_increment_ai_rate_limit(integer) to authenticated;
grant execute on function public.revert_level_completion(uuid) to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
