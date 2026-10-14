-- ALAMEEN PHASE 18.3 — TELEGRAM BUSINESS CONVERSATION CHANNEL
-- This file is intentionally NOT auto-applied by INSTALL.ps1.
-- Apply only after local build/selftests pass and after explicit approval.

create table if not exists public.telegram_business_connections (
  connection_id text primary key,
  business_user_id text not null,
  user_chat_id text,
  username text,
  first_name text,
  last_name text,
  rights jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  connection_date bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_handoff_tokens (
  token_hash text primary key,
  canonical_wa_id text not null,
  application_id uuid references public.applications(id) on delete cascade,
  tracking_id text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_business_connection_id text,
  used_telegram_chat_id text,
  used_telegram_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_handoff_tokens_expiry_idx
  on public.telegram_handoff_tokens (expires_at)
  where used_at is null;

create table if not exists public.telegram_customer_links (
  business_connection_id text not null,
  telegram_chat_id text not null,
  telegram_user_id text,
  canonical_wa_id text not null,
  application_id uuid references public.applications(id) on delete set null,
  tracking_id text,
  ai_paused_until timestamptz,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_connection_id, telegram_chat_id)
);

create index if not exists telegram_customer_links_wa_idx
  on public.telegram_customer_links (canonical_wa_id);

create table if not exists public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  update_id bigint,
  business_connection_id text not null,
  telegram_chat_id text not null,
  telegram_user_id text,
  telegram_message_id bigint not null,
  direction text not null check (direction in ('incoming','outgoing','system')),
  message_type text not null default 'text',
  body text,
  canonical_wa_id text,
  application_id uuid references public.applications(id) on delete set null,
  customer_name text,
  media_file_id text,
  media_unique_id text,
  media_storage_path text,
  media_mime_type text,
  media_file_name text,
  media_size_bytes bigint,
  transcript text,
  handled_by_ai boolean not null default false,
  status text,
  raw_payload jsonb not null default '{}'::jsonb
);

create unique index if not exists telegram_messages_transport_dedupe_idx
  on public.telegram_messages (business_connection_id, telegram_chat_id, telegram_message_id, direction);

create index if not exists telegram_messages_identity_time_idx
  on public.telegram_messages (canonical_wa_id, created_at desc);

alter table public.telegram_business_connections enable row level security;
alter table public.telegram_handoff_tokens enable row level security;
alter table public.telegram_customer_links enable row level security;
alter table public.telegram_messages enable row level security;

revoke all on table public.telegram_business_connections from anon, authenticated;
revoke all on table public.telegram_handoff_tokens from anon, authenticated;
revoke all on table public.telegram_customer_links from anon, authenticated;
revoke all on table public.telegram_messages from anon, authenticated;


-- Private media bucket for Telegram attachments. Runtime access uses the server-side
-- service role only; no public object URLs are created by Phase 18.3.
insert into storage.buckets (id, name, public, file_size_limit)
values ('telegram-media', 'telegram-media', false, 20971520)
on conflict (id) do update set public = false;
