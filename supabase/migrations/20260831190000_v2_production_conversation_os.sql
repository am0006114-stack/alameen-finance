-- ALAMEEN V2 Phase 3 Production Conversation OS
-- SAFETY DEFAULT: installs with mode=off and kill_switch=true.
-- This migration does NOT mutate applications, payments, refunds, cancellations, or customer messages.

create table if not exists public.whatsapp_v2_production_settings (
  id text primary key default 'default' check (id = 'default'),
  mode text not null default 'off' check (mode in ('off','canary','broad','full')),
  kill_switch boolean not null default true,
  canary_percent integer not null default 5 check (canary_percent between 0 and 100),
  deepseek_hourly_budget_usd numeric(12,6) not null default 3.00,
  deepseek_daily_budget_usd numeric(12,6) not null default 15.00,
  reserve_usd_per_turn numeric(12,6) not null default 0.03,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_v2_production_settings enable row level security;

insert into public.whatsapp_v2_production_settings(id,mode,kill_switch,canary_percent)
values('default','off',true,5)
on conflict(id) do update set mode='off', kill_switch=true, updated_at=now();

create table if not exists public.whatsapp_v2_production_ai_usage (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  incoming_message_id text,
  provider text not null default 'deepseek' check (provider in ('deepseek')),
  model text not null,
  purpose text not null,
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  reserved_usd numeric(12,6) not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.whatsapp_v2_production_ai_usage enable row level security;
create index if not exists whatsapp_v2_production_ai_usage_time_idx on public.whatsapp_v2_production_ai_usage(created_at desc);
create index if not exists whatsapp_v2_production_ai_usage_wa_idx on public.whatsapp_v2_production_ai_usage(wa_id,created_at desc);

create table if not exists public.whatsapp_v2_production_runs (
  id uuid primary key default gen_random_uuid(),
  incoming_message_id text,
  wa_id text not null,
  mode text not null,
  customer_message text,
  interpreted_turn jsonb,
  forced_intent text,
  application_snapshot jsonb,
  final_reply text,
  used_v2_writer boolean not null default false,
  self_repair_applied boolean not null default false,
  fail_closed_applied boolean not null default false,
  violations text[] not null default '{}',
  writer_error text,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_v2_production_runs enable row level security;
create unique index if not exists whatsapp_v2_production_runs_message_idx on public.whatsapp_v2_production_runs(incoming_message_id) where incoming_message_id is not null;
create index if not exists whatsapp_v2_production_runs_time_idx on public.whatsapp_v2_production_runs(created_at desc);
create index if not exists whatsapp_v2_production_runs_wa_idx on public.whatsapp_v2_production_runs(wa_id,created_at desc);

create or replace function public.reserve_whatsapp_v2_production_budget(
  p_model text,
  p_purpose text,
  p_wa_id text,
  p_incoming_message_id text,
  p_reserve_usd numeric
)
returns table(allowed boolean,reservation_id uuid,reason text,hour_spend numeric,day_spend numeric,hour_budget numeric,day_budget numeric)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_settings public.whatsapp_v2_production_settings%rowtype;
  v_hour_spend numeric;
  v_day_spend numeric;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('alameen_v2_production_cost_guard'));
  select * into v_settings from public.whatsapp_v2_production_settings where id='default';

  if not found or v_settings.kill_switch or v_settings.mode='off' then
    return query select false,null::uuid,'production_disabled',0::numeric,0::numeric,coalesce(v_settings.deepseek_hourly_budget_usd,0),coalesce(v_settings.deepseek_daily_budget_usd,0); return;
  end if;

  select coalesce(sum(estimated_cost_usd),0) into v_hour_spend
  from public.whatsapp_v2_production_ai_usage
  where created_at >= now()-interval '1 hour' and status in ('reserved','completed');

  select coalesce(sum(estimated_cost_usd),0) into v_day_spend
  from public.whatsapp_v2_production_ai_usage
  where created_at >= date_trunc('day',now()) and status in ('reserved','completed');

  if v_hour_spend + greatest(coalesce(p_reserve_usd,0),0) > v_settings.deepseek_hourly_budget_usd then
    return query select false,null::uuid,'hourly_budget_exceeded',v_hour_spend,v_day_spend,v_settings.deepseek_hourly_budget_usd,v_settings.deepseek_daily_budget_usd; return;
  end if;
  if v_day_spend + greatest(coalesce(p_reserve_usd,0),0) > v_settings.deepseek_daily_budget_usd then
    return query select false,null::uuid,'daily_budget_exceeded',v_hour_spend,v_day_spend,v_settings.deepseek_hourly_budget_usd,v_settings.deepseek_daily_budget_usd; return;
  end if;

  insert into public.whatsapp_v2_production_ai_usage(wa_id,incoming_message_id,provider,model,purpose,status,reserved_usd,estimated_cost_usd)
  values(p_wa_id,p_incoming_message_id,'deepseek',p_model,p_purpose,'reserved',greatest(coalesce(p_reserve_usd,0),0),greatest(coalesce(p_reserve_usd,0),0))
  returning id into v_id;

  return query select true,v_id,'allowed',v_hour_spend,v_day_spend,v_settings.deepseek_hourly_budget_usd,v_settings.deepseek_daily_budget_usd;
end;
$$;

revoke all on function public.reserve_whatsapp_v2_production_budget(text,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.reserve_whatsapp_v2_production_budget(text,text,text,text,numeric) to service_role;
