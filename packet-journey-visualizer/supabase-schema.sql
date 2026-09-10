-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).
-- It sets up: user profiles, saved custom topologies, and simulation run history,
-- all protected by Row Level Security so each user only ever sees their own data.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- auto-create a profile row whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- custom topologies ----------
create table if not exists public.topologies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null, -- { nodes: {...}, edges: [...], routes: [...] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.topologies enable row level security;

create policy "Users manage own topologies"
  on public.topologies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists topologies_user_id_idx on public.topologies(user_id);

-- ---------- simulation run history ----------
create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topology_name text not null,
  packets_sent int not null default 0,
  packets_delivered int not null default 0,
  packets_dropped int not null default 0,
  avg_latency_ms numeric,
  settings jsonb, -- { rate, speed, loss, protocols }
  recorded_at timestamptz not null default now()
);

alter table public.simulation_runs enable row level security;

create policy "Users manage own runs"
  on public.simulation_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists simulation_runs_user_id_idx on public.simulation_runs(user_id);
