-- Al-Ameen Shadow V1.1.1 — Regulatory & Business Identity Guard.
-- Safe to run more than once. Run before deploying the matching application code.

set search_path = public, extensions;

insert into public.whatsapp_shadow_settings (key, value)
values
  ('multi_agent_enabled', 'true'),
  ('shadow_prompt_version', 'solid-multi-agent-v1.1.1-regulatory-identity-guard'),
  ('shadow_business_name', 'الأمين للأقساط'),
  ('shadow_business_activity', 'تقسيط الأجهزة الإلكترونية والهواتف'),
  ('shadow_regulatory_identity', 'not_bank_not_finance_not_lender_no_loans'),
  ('shadow_central_bank_claim', 'forbidden'),
  ('shadow_legal_name_claim', 'requires_verified_source'),
  ('shadow_sensitive_documents_channel', 'official_links_only'),
  ('shadow_regulatory_routes', 'deterministic')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

notify pgrst, 'reload schema';
