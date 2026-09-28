-- ALAMEEN V3 Phase 11 — Human Conversation OS unified clean cutover
-- Additive only. Default OFF. No shadow model path is created.
-- Activation is controlled by whatsapp_human_os_settings.enabled after Phase 10.1
-- durable ingress has been validated in production.

set search_path = public, extensions;

create table if not exists public.whatsapp_human_os_settings (
  id text primary key,
  enabled boolean not null default false,
  sol_enabled boolean not null default false,
  max_recent_turns integer not null default 6 check (max_recent_turns between 2 and 10),
  max_prompt_chars integer not null default 18000 check (max_prompt_chars between 8000 and 30000),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_human_os_settings enable row level security;

insert into public.whatsapp_human_os_settings (id, enabled, sol_enabled, max_recent_turns, max_prompt_chars)
values ('default', false, false, 6, 18000)
on conflict (id) do nothing;

create table if not exists public.whatsapp_human_memory (
  wa_id text primary key,
  revision bigint not null default 0,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_human_memory enable row level security;
create index if not exists whatsapp_human_memory_updated_idx on public.whatsapp_human_memory (updated_at desc);

create table if not exists public.whatsapp_turn_journal (
  turn_id text primary key,
  wa_id text not null,
  incoming_message_id text,
  customer_text text,
  status text not null default 'started'
    check (status in ('started','interpreted','decided','reply_ready','delivered','completed','failed')),
  model_tier text check (model_tier is null or model_tier in ('deterministic','deepseek','sol')),
  model_calls integer not null default 0 check (model_calls between 0 and 4),
  meaning_json jsonb,
  truth_json jsonb,
  actions_json jsonb,
  final_reply text,
  state_after_json jsonb,
  memory_after_json jsonb,
  provider_message_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  completed_at timestamptz
);

alter table public.whatsapp_turn_journal enable row level security;
create index if not exists whatsapp_turn_journal_wa_idx on public.whatsapp_turn_journal (wa_id, created_at desc);
create index if not exists whatsapp_turn_journal_status_idx on public.whatsapp_turn_journal (status, updated_at);
create index if not exists whatsapp_turn_journal_incoming_idx on public.whatsapp_turn_journal (incoming_message_id) where incoming_message_id is not null;

notify pgrst, 'reload schema';
