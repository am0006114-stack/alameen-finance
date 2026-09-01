create table if not exists public.whatsapp_v3_production_settings (
  id text primary key,
  live_enabled boolean not null default false,
  kill_switch boolean not null default false,
  real_actions_enabled boolean not null default false,
  resume_legacy_ignored boolean not null default true,
  runtime_version text not null default 'v3.0.0-phase6-live-cutover',
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_v3_production_settings enable row level security;

insert into public.whatsapp_v3_production_settings (
  id, live_enabled, kill_switch, real_actions_enabled, resume_legacy_ignored, runtime_version, updated_at
)
values ('default', false, false, false, true, 'v3.0.0-phase6-live-cutover', now())
on conflict (id) do update set
  runtime_version = excluded.runtime_version,
  resume_legacy_ignored = true,
  updated_at = now();
