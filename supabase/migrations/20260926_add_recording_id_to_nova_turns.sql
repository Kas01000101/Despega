alter table public.nova_turns
add column if not exists recording_id text;

create unique index if not exists nova_turns_session_recording_uidx
on public.nova_turns(session_id, recording_id)
where recording_id is not null;
