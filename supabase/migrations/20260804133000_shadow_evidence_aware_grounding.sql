-- Al-Ameen Shadow Solid Multi-Agent V1.1 — Evidence-aware grounding.
-- Safe to run more than once. Run before deploying the matching application code.

set search_path = public, extensions;

create index if not exists whatsapp_shadow_jobs_prompt_version_created_idx
  on public.whatsapp_shadow_jobs (prompt_version, created_at desc);

insert into public.whatsapp_shadow_settings (key, value)
values
  ('multi_agent_enabled', 'true'),
  ('shadow_prompt_version', 'solid-multi-agent-v1.1-evidence-aware'),
  ('shadow_grounding_mode', 'structured_facts+conversation_evidence+business_policy'),
  ('shadow_device_change_evidence', 'required'),
  ('shadow_contact_source', 'official_constants_only'),
  ('shadow_multi_topic_composer', 'true'),
  ('shadow_sticky_agent', 'true'),
  ('shadow_primary_model', 'deepseek-v4-pro'),
  ('shadow_simple_model', 'deepseek-v4-flash')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

notify pgrst, 'reload schema';
