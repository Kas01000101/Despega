alter table public.nova_chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.nova_chat_diagnostics
  add column if not exists intent text not null default '',
  add column if not exists message_type text not null default '',
  add column if not exists card_count integer not null default 0,
  add column if not exists action_count integer not null default 0,
  add column if not exists opportunity_refs_count integer not null default 0,
  add column if not exists resource_refs_count integer not null default 0,
  add column if not exists link_click_count integer not null default 0;

comment on column public.nova_chat_messages.metadata is
  'Sanitized Nova chat UI metadata: actions, cards, referenced ids, message type and motivation. URLs are not stored here.';

comment on column public.nova_chat_diagnostics.link_click_count is
  'Count of verified external-link clicks associated with the originating chat request.';
