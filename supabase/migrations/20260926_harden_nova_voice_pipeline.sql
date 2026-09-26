-- DESPEGA+ Nova voice diagnostics and interview auditability
-- Additive migration: no raw audio is persisted.

alter table public.nova_turns
  add column if not exists question_id text not null default '',
  add column if not exists transcription_quality text not null default '',
  add column if not exists stop_reason text not null default '';

create unique index if not exists nova_turns_session_recording_uidx
  on public.nova_turns(session_id, recording_id)
  where recording_id is not null;

create table if not exists public.nova_voice_diagnostics (
  id uuid primary key default gen_random_uuid(),
  session_id text not null
    references public.nova_sessions(session_id)
    on delete cascade,
  recording_id text not null,
  question_id text not null default '',
  question text not null default '',
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  stop_reason text not null default '',
  blob_size integer not null default 0 check (blob_size >= 0),
  mime_type text not null default '',
  noise_floor double precision,
  vad_threshold double precision,
  transcript_length integer not null default 0 check (transcript_length >= 0),
  transcription_quality text not null default '',
  transcription_model text not null default '',
  transcription_ms integer not null default 0 check (transcription_ms >= 0),
  transcription_fallback_used boolean not null default false,
  analysis_model text not null default '',
  analysis_ms integer not null default 0 check (analysis_ms >= 0),
  analysis_fallback_used boolean not null default false,
  http_status integer,
  error_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, recording_id)
);

create index if not exists nova_voice_diagnostics_session_created_idx
  on public.nova_voice_diagnostics(session_id, created_at);

alter table public.nova_voice_diagnostics enable row level security;
revoke all on table public.nova_voice_diagnostics from anon, authenticated;
