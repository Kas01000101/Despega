revoke all on table public.nova_chat_sessions from anon, authenticated;
revoke all on table public.nova_chat_messages from anon, authenticated;
revoke all on table public.nova_chat_diagnostics from anon, authenticated;

grant select, insert, update, delete on table public.nova_chat_sessions to service_role;
grant select, insert, update, delete on table public.nova_chat_messages to service_role;
grant select, insert, update, delete on table public.nova_chat_diagnostics to service_role;
grant usage, select on sequence public.nova_chat_diagnostics_id_seq to service_role;
