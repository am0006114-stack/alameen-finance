-- Al-Ameen Shadow V1.1.3 — Stage-Aware Status & Gender-Aware Language.
-- Safe to run more than once.

set search_path = public, extensions;

insert into public.whatsapp_shadow_settings (key, value)
values
  ('multi_agent_enabled', 'true'),
  ('shadow_prompt_version', 'solid-multi-agent-v1.1.3-stage-gender-guard'),
  ('shadow_stage_aware_status', 'enabled'),
  ('shadow_gender_aware_language', 'enabled'),
  ('shadow_unknown_gender_language', 'neutral'),
  ('shadow_empty_link_label_guard', 'enabled'),
  ('shadow_stage_language_validator', 'enabled')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

notify pgrst, 'reload schema';
