create table if not exists public.run_sessions (
  id                uuid primary key,
  student_id        uuid not null references auth.users(id) on delete cascade,
  plan_id           uuid references public.ai_plans(id) on delete set null,
  status            text not null default 'in_progress',
  started_at        timestamptz,
  completed_at      timestamptz,
  last_active_at    timestamptz,
  distance_m        numeric  not null default 0,
  duration_s        integer  not null default 0,
  avg_pace_s_per_km integer,
  elevation_gain_m  numeric,
  calories          integer,
  encoded_polyline  text,
  splits            jsonb not null default '[]'::jsonb,
  session_state     jsonb,
  source            text  not null default 'gps',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

grant select, insert, update, delete on public.run_sessions to authenticated;
grant all on public.run_sessions to service_role;

create index if not exists run_sessions_student_status_idx
  on public.run_sessions (student_id, status);

create index if not exists run_sessions_student_created_idx
  on public.run_sessions (student_id, created_at desc);

alter table public.run_sessions enable row level security;

drop policy if exists "run_sessions_select_own" on public.run_sessions;
create policy "run_sessions_select_own"
  on public.run_sessions for select
  using (auth.uid() = student_id);

drop policy if exists "run_sessions_insert_own" on public.run_sessions;
create policy "run_sessions_insert_own"
  on public.run_sessions for insert
  with check (auth.uid() = student_id);

drop policy if exists "run_sessions_update_own" on public.run_sessions;
create policy "run_sessions_update_own"
  on public.run_sessions for update
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);

drop trigger if exists run_sessions_set_updated_at on public.run_sessions;
create trigger run_sessions_set_updated_at
  before update on public.run_sessions
  for each row execute function public.update_updated_at();

notify pgrst, 'reload schema';