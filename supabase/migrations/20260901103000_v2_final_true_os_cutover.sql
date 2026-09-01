-- ALAMEEN V2 FINAL TRUE CONVERSATION OS CUTOVER
-- SAFETY: V2 is forced OFF with KILL SWITCH ON during migration.
-- This migration touches ONLY V2 production configuration/log/AI-usage schema.
-- It does NOT mutate applications, payments, refunds, cancellations, or customer state.

alter table public.whatsapp_v2_production_settings
  add column if not exists openai_hourly_budget_usd numeric(12,6) not null default 2.00,
  add column if not exists openai_daily_budget_usd numeric(12,6) not null default 8.00,
  add column if not exists openai_reserve_usd_per_audit numeric(12,6) not null default 0.02;

alter table public.whatsapp_v2_production_runs
  add column if not exists truth_source text,
  add column if not exists truth_confidence text,
  add column if not exists auditor_used boolean not null default false,
  add column if not exists auditor_passed boolean,
  add column if not exists safe_composer_applied boolean not null default false,
  add column if not exists legacy_action_executor_used boolean not null default false;

alter table public.whatsapp_v2_production_ai_usage
  drop constraint if exists whatsapp_v2_production_ai_usage_provider_check;

alter table public.whatsapp_v2_production_ai_usage
  add constraint whatsapp_v2_production_ai_usage_provider_check
  check (provider in ('deepseek','openai'));

create or replace function public.reserve_whatsapp_v2_production_provider_budget(
  p_provider text,
  p_model text,
  p_purpose text,
  p_wa_id text,
  p_incoming_message_id text,
  p_reserve_usd numeric
)
returns table(
  allowed boolean,
  reservation_id uuid,
  reason text,
  hour_spend numeric,
  day_spend numeric,
  hour_budget numeric,
  day_budget numeric
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_settings public.whatsapp_v2_production_settings%rowtype;
  v_hour_spend numeric;
  v_day_spend numeric;
  v_hour_budget numeric;
  v_day_budget numeric;
  v_id uuid;
  v_provider text := lower(coalesce(p_provider,''));
begin
  if v_provider not in ('deepseek','openai') then
    return query select false,null::uuid,'unsupported_provider',0::numeric,0::numeric,0::numeric,0::numeric;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('alameen_v2_production_cost_guard'));

  select * into v_settings
  from public.whatsapp_v2_production_settings
  where id='default';

  if not found or v_settings.kill_switch or v_settings.mode='off' then
    return query select false,null::uuid,'production_disabled',0::numeric,0::numeric,0::numeric,0::numeric;
    return;
  end if;

  if v_provider='openai' then
    v_hour_budget := v_settings.openai_hourly_budget_usd;
    v_day_budget := v_settings.openai_daily_budget_usd;
  else
    v_hour_budget := v_settings.deepseek_hourly_budget_usd;
    v_day_budget := v_settings.deepseek_daily_budget_usd;
  end if;

  select coalesce(sum(estimated_cost_usd),0)
    into v_hour_spend
  from public.whatsapp_v2_production_ai_usage
  where provider=v_provider
    and created_at >= now()-interval '1 hour'
    and status in ('reserved','completed');

  select coalesce(sum(estimated_cost_usd),0)
    into v_day_spend
  from public.whatsapp_v2_production_ai_usage
  where provider=v_provider
    and created_at >= date_trunc('day',now())
    and status in ('reserved','completed');

  if v_hour_spend + greatest(coalesce(p_reserve_usd,0),0) > v_hour_budget then
    return query select false,null::uuid,'hourly_budget_exceeded',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
    return;
  end if;

  if v_day_spend + greatest(coalesce(p_reserve_usd,0),0) > v_day_budget then
    return query select false,null::uuid,'daily_budget_exceeded',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
    return;
  end if;

  insert into public.whatsapp_v2_production_ai_usage(
    wa_id,incoming_message_id,provider,model,purpose,status,reserved_usd,estimated_cost_usd
  ) values (
    p_wa_id,p_incoming_message_id,v_provider,p_model,p_purpose,'reserved',
    greatest(coalesce(p_reserve_usd,0),0),greatest(coalesce(p_reserve_usd,0),0)
  ) returning id into v_id;

  return query select true,v_id,'allowed',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
end;
$$;

revoke all on function public.reserve_whatsapp_v2_production_provider_budget(text,text,text,text,text,numeric)
from public, anon, authenticated;

grant execute on function public.reserve_whatsapp_v2_production_provider_budget(text,text,text,text,text,numeric)
to service_role;

-- Fail-safe after schema installation. Explicit operator action is required to re-enable V2.
update public.whatsapp_v2_production_settings
set mode='off', kill_switch=true, updated_at=now()
where id='default';
