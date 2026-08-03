-- Al-Ameen Shadow Solid Multi-Agent architecture.
-- Safe to run more than once. Run before deploying the matching application code.

set search_path = public, extensions;

alter table public.whatsapp_shadow_jobs
  add column if not exists agent_name text,
  add column if not exists decision_mode text,
  add column if not exists route_reason text,
  add column if not exists sensitive_route boolean not null default false,
  add column if not exists deterministic_template text,
  add column if not exists draft_reply text,
  add column if not exists draft_risk_flags text[] not null default '{}',
  add column if not exists policy_checks jsonb not null default '[]'::jsonb,
  add column if not exists fallback_applied boolean not null default false,
  add column if not exists prompt_version text,
  add column if not exists decision_outcome text,
  add column if not exists draft_model text,
  add column if not exists final_model text;

create index if not exists whatsapp_shadow_jobs_agent_created_idx
  on public.whatsapp_shadow_jobs (agent, created_at desc);

create index if not exists whatsapp_shadow_jobs_mode_created_idx
  on public.whatsapp_shadow_jobs (decision_mode, created_at desc);

create index if not exists whatsapp_shadow_jobs_fallback_created_idx
  on public.whatsapp_shadow_jobs (fallback_applied, created_at desc)
  where fallback_applied = true;

insert into public.whatsapp_shadow_settings (key, value)
values
  ('ab_test_enabled', 'false'),
  ('multi_agent_enabled', 'true'),
  ('shadow_prompt_version', 'solid-multi-agent-v1'),
  ('shadow_sensitive_routes', 'deterministic'),
  ('shadow_primary_model', 'deepseek-v4-pro'),
  ('shadow_simple_model', 'deepseek-v4-flash')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

notify pgrst, 'reload schema';
