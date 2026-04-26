-- EnerGenius — initial schema (paste into Supabase SQL editor)

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  home_zip text,
  t_min_f int not null default 68,
  t_max_f int not null default 76,
  cost_weight double precision not null default 0.5,
  carbon_weight double precision not null default 0.3,
  comfort_weight double precision not null default 0.2,
  created_at timestamptz not null default now()
);

create table public.appliances (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  duration_hours double precision not null,
  power_kw double precision not null,
  enabled boolean not null default true
);

create table public.availability (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  slots boolean[48] not null,
  primary key (user_id, date)
);

create table public.feedback_events (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  appliance text not null,
  chosen_option text not null,
  response text not null,
  suggested_time timestamptz,
  created_at timestamptz not null default now()
);

create table public.recommendations_cache (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  payload jsonb,
  cached_at timestamptz,
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.appliances enable row level security;
alter table public.availability enable row level security;
alter table public.feedback_events enable row level security;
alter table public.recommendations_cache enable row level security;

-- profiles: users manage their own row (id = auth.uid())
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid ());

create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid ());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid ()) with check (id = auth.uid ());

create policy "profiles_delete_own" on public.profiles
  for delete using (id = auth.uid ());

-- appliances
create policy "appliances_select_own" on public.appliances
  for select using (user_id = auth.uid ());

create policy "appliances_insert_own" on public.appliances
  for insert with check (user_id = auth.uid ());

create policy "appliances_update_own" on public.appliances
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

create policy "appliances_delete_own" on public.appliances
  for delete using (user_id = auth.uid ());

-- availability
create policy "availability_select_own" on public.availability
  for select using (user_id = auth.uid ());

create policy "availability_insert_own" on public.availability
  for insert with check (user_id = auth.uid ());

create policy "availability_update_own" on public.availability
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

create policy "availability_delete_own" on public.availability
  for delete using (user_id = auth.uid ());

-- feedback_events
create policy "feedback_select_own" on public.feedback_events
  for select using (user_id = auth.uid ());

create policy "feedback_insert_own" on public.feedback_events
  for insert with check (user_id = auth.uid ());

create policy "feedback_update_own" on public.feedback_events
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

create policy "feedback_delete_own" on public.feedback_events
  for delete using (user_id = auth.uid ());

-- recommendations_cache
create policy "rec_cache_select_own" on public.recommendations_cache
  for select using (user_id = auth.uid ());

create policy "rec_cache_insert_own" on public.recommendations_cache
  for insert with check (user_id = auth.uid ());

create policy "rec_cache_update_own" on public.recommendations_cache
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

create policy "rec_cache_delete_own" on public.recommendations_cache
  for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- New user → profile row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user ();
