alter table public.profiles
  add column if not exists timezone text not null default 'UTC';

alter table public.appliances
  add column if not exists requires_presence boolean not null default false;

update public.appliances
set requires_presence = case
  when lower(name) in ('dishwasher', 'washing machine', 'washing_machine', 'dryer') then true
  when lower(name) in ('ev charger', 'ev_charger', 'water heater', 'water_heater_boost') then false
  else requires_presence
end;

create table if not exists public.availability_assistant_actions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id text,
  source text not null check (source in ('calendar_sync', 'chat_edit')),
  status text not null check (status in ('pending', 'applied', 'skipped', 'cancelled')),
  date date not null,
  start_slot int not null check (start_slot >= 0 and start_slot < 48),
  end_slot int not null check (end_slot > start_slot and end_slot <= 48),
  set_home boolean,
  question_text text,
  reason text,
  raw_user_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists availability_assistant_actions_user_status_idx
  on public.availability_assistant_actions (user_id, status, date);

create index if not exists availability_assistant_actions_thread_status_idx
  on public.availability_assistant_actions (thread_id, status);

alter table public.availability_assistant_actions enable row level security;

create policy "availability_actions_select_own" on public.availability_assistant_actions
  for select using (user_id = auth.uid ());

create policy "availability_actions_insert_own" on public.availability_assistant_actions
  for insert with check (user_id = auth.uid ());

create policy "availability_actions_update_own" on public.availability_assistant_actions
  for update using (user_id = auth.uid ()) with check (user_id = auth.uid ());

create policy "availability_actions_delete_own" on public.availability_assistant_actions
  for delete using (user_id = auth.uid ());
