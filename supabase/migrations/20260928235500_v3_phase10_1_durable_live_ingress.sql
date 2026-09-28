-- ALAMEEN V3 Phase 10.1 — Durable Live Ingress Cutover
-- Date: 2026-09-28
-- Purpose: acknowledge Meta webhooks only after durable enqueue, then process live
-- customer traffic from an internal retryable queue. This is NOT a shadow path and
-- does not make any additional AI/model call beyond the one production turn.
--
-- Safety:
-- - additive tables/functions only;
-- - no application/payment/refund schema mutation;
-- - unique event_key makes Meta retries idempotent before AI execution;
-- - oldest unfinished job per wa_id is the only claimable job for that conversation;
-- - queue trigger is primary wake-up; pg_cron is only a backlog/retry safety net.

set search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.whatsapp_live_ingress_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_live_ingress_settings enable row level security;

insert into public.whatsapp_live_ingress_settings (key, value)
values ('worker_token', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create table if not exists public.whatsapp_live_ingress_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  event_key text not null unique,
  event_kind text not null check (event_kind in ('message','status')),
  wa_id text,
  incoming_message_id text,
  payload jsonb not null,

  status text not null default 'queued'
    check (status in ('queued','processing','retry_wait','succeeded','dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz default now(),
  locked_at timestamptz,
  locked_by text,

  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.whatsapp_live_ingress_jobs enable row level security;

create index if not exists whatsapp_live_ingress_jobs_due_idx
  on public.whatsapp_live_ingress_jobs (status, next_attempt_at, created_at);
create index if not exists whatsapp_live_ingress_jobs_wa_idx
  on public.whatsapp_live_ingress_jobs (wa_id, created_at);
create index if not exists whatsapp_live_ingress_jobs_incoming_idx
  on public.whatsapp_live_ingress_jobs (incoming_message_id)
  where incoming_message_id is not null;
create index if not exists whatsapp_live_ingress_jobs_created_idx
  on public.whatsapp_live_ingress_jobs (created_at desc);

create or replace function public.claim_whatsapp_live_ingress_jobs(
  p_worker_id text,
  p_limit integer default 4
)
returns setof public.whatsapp_live_ingress_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_worker_id), '') = '' then
    raise exception 'p_worker_id is required';
  end if;

  return query
  with selected as (
    select j.id
    from public.whatsapp_live_ingress_jobs j
    where j.status in ('queued','retry_wait')
      and coalesce(j.next_attempt_at, now()) <= now()
      and j.attempt_count < j.max_attempts
      and not exists (
        select 1
        from public.whatsapp_live_ingress_jobs older
        where coalesce(older.wa_id, older.event_key) = coalesce(j.wa_id, j.event_key)
          and older.status in ('queued','processing','retry_wait')
          and (
            older.created_at < j.created_at
            or (older.created_at = j.created_at and older.id::text < j.id::text)
          )
      )
    order by j.created_at asc, j.id asc
    for update of j skip locked
    limit greatest(1, least(coalesce(p_limit, 4), 8))
  ), claimed as (
    update public.whatsapp_live_ingress_jobs j
    set status = 'processing',
        attempt_count = j.attempt_count + 1,
        locked_at = now(),
        locked_by = p_worker_id,
        updated_at = now()
    from selected s
    where j.id = s.id
    returning j.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_whatsapp_live_ingress_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_live_ingress_jobs(text, integer) to service_role;

create or replace function public.requeue_stale_whatsapp_live_ingress_jobs(
  p_stale_minutes integer default 6
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.whatsapp_live_ingress_jobs
  set status = case when attempt_count >= max_attempts then 'dead_letter' else 'retry_wait' end,
      next_attempt_at = case when attempt_count >= max_attempts then null else now() end,
      completed_at = case when attempt_count >= max_attempts then now() else completed_at end,
      last_error_code = coalesce(last_error_code, 'stale_worker_lock'),
      last_error_message = coalesce(last_error_message, 'Durable live-ingress worker lease expired and was released.'),
      locked_at = null,
      locked_by = null,
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - make_interval(mins => greatest(1, coalesce(p_stale_minutes, 6)));

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.requeue_stale_whatsapp_live_ingress_jobs(integer) from public, anon, authenticated;
grant execute on function public.requeue_stale_whatsapp_live_ingress_jobs(integer) to service_role;

-- Primary asynchronous wake-up. Queue durability does not depend on pg_net: if the
-- kick fails the row stays queued and the backup scheduler can drain it later.
do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net unavailable; durable ingress queue remains usable: %', sqlerrm;
  end;
end $$;

create or replace function public.kick_alameen_live_ingress_worker()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_token text;
begin
  select value into v_token
  from public.whatsapp_live_ingress_settings
  where key = 'worker_token';

  if coalesce(v_token, '') = '' then
    return new;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      perform net.http_post(
        url := 'https://www.ameenfinance.co/api/internal/whatsapp-live-ingress/worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-alameen-live-worker-token', v_token
        ),
        body := jsonb_build_object(
          'source', 'live_ingress_insert_trigger',
          'job_id', new.id,
          'event_key', new.event_key
        )
      );
    exception when others then
      raise warning 'Durable live-ingress worker kick failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kick_whatsapp_live_ingress_worker on public.whatsapp_live_ingress_jobs;
create trigger trg_kick_whatsapp_live_ingress_worker
after insert on public.whatsapp_live_ingress_jobs
for each row
execute function public.kick_alameen_live_ingress_worker();

-- Backup drain for retries/backlog. It does not generate shadow traffic; it only
-- asks the live worker to process already-durable customer events.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable; insert trigger remains primary: %', sqlerrm;
  end;
end $$;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    for existing_job_id in
      select jobid from cron.job
      where jobname = 'alameen-whatsapp-live-ingress-worker'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'alameen-whatsapp-live-ingress-worker',
      '* * * * *',
      $cron$
      select net.http_post(
        url := 'https://www.ameenfinance.co/api/internal/whatsapp-live-ingress/worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-alameen-live-worker-token', (
            select value from public.whatsapp_live_ingress_settings where key = 'worker_token'
          )
        ),
        body := jsonb_build_object('source', 'supabase_cron')
      );
      $cron$
    );
  end if;
end $$;

notify pgrst, 'reload schema';
