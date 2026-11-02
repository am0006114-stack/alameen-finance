-- Applied to Production on 2026-11-02.
-- Additive only: no change to applications/payment truth or existing channel tables.

create table if not exists public.customer_postpayment_channel_state (
  application_id uuid primary key references public.applications(id) on delete cascade,
  canonical_wa_id text not null,
  primary_channel text null check (primary_channel is null or primary_channel in ('web', 'telegram')),
  web_available boolean not null default false,
  whatsapp_routine_blocked boolean not null default false,
  whatsapp_redirect_notice_sent boolean not null default false,
  activated_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists customer_postpayment_channel_state_wa_idx
  on public.customer_postpayment_channel_state(canonical_wa_id);

create table if not exists public.web_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  canonical_wa_id text not null,
  tracking_id text null,
  bootstrap_token_hash text unique,
  bootstrap_expires_at timestamptz not null,
  bootstrap_used_at timestamptz null,
  session_token_hash text unique,
  session_expires_at timestamptz null,
  revoked_at timestamptz null,
  last_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_chat_sessions_application_idx
  on public.web_chat_sessions(application_id);
create index if not exists web_chat_sessions_wa_idx
  on public.web_chat_sessions(canonical_wa_id);

create table if not exists public.web_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid not null references public.applications(id) on delete cascade,
  canonical_wa_id text not null,
  session_id uuid null references public.web_chat_sessions(id) on delete set null,
  client_message_id text null,
  direction text not null check (direction in ('incoming', 'outgoing', 'system')),
  message_type text not null default 'text',
  body text null,
  handled_by_ai boolean not null default false,
  status text null,
  raw_payload jsonb not null default '{}'::jsonb
);

create unique index if not exists web_chat_messages_client_message_uidx
  on public.web_chat_messages(client_message_id)
  where client_message_id is not null;
create index if not exists web_chat_messages_application_time_idx
  on public.web_chat_messages(application_id, created_at, id);
create index if not exists web_chat_messages_wa_time_idx
  on public.web_chat_messages(canonical_wa_id, created_at, id);

create table if not exists public.web_chat_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.web_chat_settings(key, value)
values
  ('postpayment_channel_choice_enabled', 'false'),
  ('web_chat_enabled', 'false'),
  ('whatsapp_hard_cutover_enabled', 'false')
on conflict (key) do nothing;

alter table public.customer_postpayment_channel_state enable row level security;
alter table public.web_chat_sessions enable row level security;
alter table public.web_chat_messages enable row level security;
alter table public.web_chat_settings enable row level security;
