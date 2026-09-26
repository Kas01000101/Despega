-- DESPEGA+ Nova MVP
-- Reproducible schema for conversational sessions, profiles and turns.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  onboarding_data jsonb not null default '{}'::jsonb,
  nova_profile jsonb not null default '{}'::jsonb,
  profile_completeness integer not null default 0
    check (profile_completeness between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'abandoned')),
  useful_answers_count integer not null default 0
    check (useful_answers_count >= 0),
  turns_count integer not null default 0
    check (turns_count >= 0),
  memory_summary text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.nova_turns (
  id uuid primary key default gen_random_uuid(),
  session_id text not null
    references public.nova_sessions(session_id)
    on delete cascade,
  question text not null default '',
  transcript text not null default '',
  summary text not null default '',
  turn_intent text not null default 'answer',
  nova_reaction text not null default '',
  follow_up_strategy text not null default '',
  answer_sufficiency text not null default '',
  duration_ms integer
    check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists nova_turns_session_created_idx
  on public.nova_turns(session_id, created_at);

alter table public.profiles enable row level security;
alter table public.nova_sessions enable row level security;
alter table public.nova_turns enable row level security;

-- MVP security model:
-- Browser clients do not read/write these tables directly.
-- The Edge Function persists through server-side credentials.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.nova_sessions from anon, authenticated;
revoke all on table public.nova_turns from anon, authenticated;
