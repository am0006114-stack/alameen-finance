-- Al-Ameen Shadow V1.1.2 — Refund Intent & Final Send Guard.
-- Safe to run more than once.

set search_path = public, extensions;

insert into public.whatsapp_shadow_settings (key, value)
values
  ('multi_agent_enabled', 'true'),
  ('shadow_prompt_version', 'solid-multi-agent-v1.1.2-refund-intent-final-send-guard'),
  ('shadow_refund_intent_canonicalization', 'enabled'),
  ('shadow_refund_transfer_timing_route', 'deterministic'),
  ('shadow_human_contact_route', 'deterministic_whatsapp'),
  ('shadow_final_send_guard', 'enabled'),
  ('shadow_sensitive_documents_channel', 'official_links_only'),
  ('shadow_delay_language', 'queue_pressure_or_exceptional_operations')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

notify pgrst, 'reload schema';
