-- ALAMEEN V2.1 — NO LEGACY ESCAPE + REAL ACTION PLANE + STATE-AWARE AUDIT
-- SAFETY DEFAULT: installs with V2 OFF and GLOBAL KILL ON.
-- This migration creates V2.1 telemetry/action infrastructure only.
-- It DOES NOT mutate any application, payment, refund, cancellation, or customer business state.

alter table public.whatsapp_v2_production_runs
  add column if not exists runtime_version text,
  add column if not exists understanding_quality jsonb,
  add column if not exists action_result jsonb,
  add column if not exists route_outcome text,
  add column if not exists fallback_reason text;

create index if not exists whatsapp_v2_production_runs_runtime_time_idx
  on public.whatsapp_v2_production_runs(runtime_version, created_at desc);

create table if not exists public.whatsapp_v2_human_action_queue (
  id uuid primary key default gen_random_uuid(),
  incoming_message_id text not null,
  wa_id text not null,
  application_id text,
  tracking_id text,
  action_type text not null check (action_type in ('human_handoff','call_request','application_data_correction')),
  customer_message text,
  status text not null default 'pending' check (status in ('pending','accepted','closed','failed')),
  runtime_version text not null default 'v2.1.0',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  unique(incoming_message_id, action_type)
);

alter table public.whatsapp_v2_human_action_queue enable row level security;

create index if not exists whatsapp_v2_human_action_queue_status_time_idx
  on public.whatsapp_v2_human_action_queue(status, created_at desc);
create index if not exists whatsapp_v2_human_action_queue_wa_idx
  on public.whatsapp_v2_human_action_queue(wa_id, created_at desc);

-- Safety latch: source deployment + explicit verification must happen before reactivation.
update public.whatsapp_v2_production_settings
set mode='off', kill_switch=true, updated_at=now()
where id='default';
