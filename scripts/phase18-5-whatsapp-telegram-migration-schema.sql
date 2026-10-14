-- Phase 18.5 — WhatsApp -> Telegram post-payment migration state.
-- Local package only: INSTALL.ps1 does NOT apply this SQL.
-- Apply to Production only during an explicitly approved Phase 18.5 cutover.

create table if not exists public.whatsapp_telegram_migration_state (
  application_id uuid primary key references public.applications(id) on delete cascade,
  canonical_wa_id text not null,
  state text not null default 'eligible'
    check (state in ('eligible','handoff_sent','linked','exhausted')),
  outbound_count integer not null default 0
    check (outbound_count >= 0 and outbound_count <= 5),
  linked_notice_sent boolean not null default false,
  last_source_key text null,
  last_handoff_sent_at timestamptz null,
  linked_at timestamptz null,
  first_eligible_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_telegram_migration_state_wa_idx
  on public.whatsapp_telegram_migration_state (canonical_wa_id, updated_at desc);

alter table public.whatsapp_telegram_migration_state enable row level security;

revoke all on table public.whatsapp_telegram_migration_state from anon;
revoke all on table public.whatsapp_telegram_migration_state from authenticated;
grant all on table public.whatsapp_telegram_migration_state to service_role;

create or replace function public.reserve_whatsapp_telegram_migration_message(
  p_application_id uuid,
  p_wa_id text,
  p_source_key text,
  p_kind text
)
returns table (
  allowed boolean,
  outbound_count integer,
  state text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_state text;
begin
  if p_application_id is null or nullif(btrim(coalesce(p_wa_id, '')), '') is null then
    raise exception 'invalid_migration_identity';
  end if;

  if p_kind not in ('handoff', 'linked_notice') then
    raise exception 'invalid_migration_kind';
  end if;

  insert into public.whatsapp_telegram_migration_state (
    application_id,
    canonical_wa_id,
    state,
    updated_at
  )
  values (
    p_application_id,
    btrim(p_wa_id),
    'eligible',
    now()
  )
  on conflict (application_id) do nothing;

  if p_kind = 'linked_notice' then
    update public.whatsapp_telegram_migration_state as s
       set canonical_wa_id = btrim(p_wa_id),
           outbound_count = s.outbound_count + 1,
           state = 'linked',
           linked_notice_sent = true,
           linked_at = coalesce(s.linked_at, now()),
           last_source_key = p_source_key,
           updated_at = now()
     where s.application_id = p_application_id
       and s.outbound_count < 5
       and s.linked_notice_sent = false
       and coalesce(s.last_source_key, '') <> coalesce(p_source_key, '')
     returning s.outbound_count,
               s.state
          into v_count, v_state;
  else
    update public.whatsapp_telegram_migration_state as s
       set canonical_wa_id = btrim(p_wa_id),
           outbound_count = s.outbound_count + 1,
           state = case when s.outbound_count + 1 >= 5 then 'exhausted' else 'handoff_sent' end,
           last_source_key = p_source_key,
           last_handoff_sent_at = now(),
           updated_at = now()
     where s.application_id = p_application_id
       and s.outbound_count < 5
       and s.state <> 'linked'
       and (s.last_handoff_sent_at is null or s.last_handoff_sent_at <= now() - interval '10 minutes')
       and coalesce(s.last_source_key, '') <> coalesce(p_source_key, '')
     returning s.outbound_count,
               s.state
          into v_count, v_state;
  end if;

  if found then
    return query select true, v_count, v_state;
    return;
  end if;

  select s.outbound_count, s.state
    into v_count, v_state
    from public.whatsapp_telegram_migration_state s
   where s.application_id = p_application_id;

  return query select false, coalesce(v_count, 0), coalesce(v_state, 'eligible');
end;
$$;

revoke all on function public.reserve_whatsapp_telegram_migration_message(uuid,text,text,text) from public;
revoke all on function public.reserve_whatsapp_telegram_migration_message(uuid,text,text,text) from anon;
revoke all on function public.reserve_whatsapp_telegram_migration_message(uuid,text,text,text) from authenticated;
grant execute on function public.reserve_whatsapp_telegram_migration_message(uuid,text,text,text) to service_role;
