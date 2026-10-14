-- Phase 18.5.1 — 20s Humanized Conversation Intelligence
-- Prepared migration. Applying this file is a PRODUCTION DATABASE WRITE.
-- It is intentionally NOT executed by the local installer.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.telegram_intelligence_hold_jobs (
  id uuid primary key default gen_random_uuid(),
  business_connection_id text not null,
  telegram_chat_id text not null,
  canonical_wa_id text not null,
  application_id uuid null references public.applications(id) on delete set null,
  status text not null default 'idle' check (status in ('idle','queued','processing')),
  window_started_at timestamptz null,
  due_at timestamptz null,
  latest_message_id bigint null,
  latest_update_id bigint null,
  attempt_count integer not null default 0,
  locked_at timestamptz null,
  locked_by text null,
  last_completed_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_connection_id, telegram_chat_id)
);

create index if not exists telegram_intelligence_hold_due_idx
  on public.telegram_intelligence_hold_jobs (status, due_at)
  where status = 'queued';

alter table public.telegram_intelligence_hold_jobs enable row level security;
revoke all on public.telegram_intelligence_hold_jobs from anon, authenticated;
grant all on public.telegram_intelligence_hold_jobs to service_role;

create or replace function public.enqueue_telegram_intelligence_hold(
  p_business_connection_id text,
  p_telegram_chat_id text,
  p_canonical_wa_id text,
  p_application_id uuid,
  p_latest_message_id bigint,
  p_latest_update_id bigint,
  p_hold_seconds integer default 20
)
returns table(queued boolean, due_at timestamptz, window_started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_due timestamptz := now() + make_interval(secs => greatest(1, least(120, coalesce(p_hold_seconds, 20))));
  v_row public.telegram_intelligence_hold_jobs%rowtype;
begin
  insert into public.telegram_intelligence_hold_jobs (
    business_connection_id,
    telegram_chat_id,
    canonical_wa_id,
    application_id,
    status,
    window_started_at,
    due_at,
    latest_message_id,
    latest_update_id,
    attempt_count,
    locked_at,
    locked_by,
    last_error,
    updated_at
  ) values (
    p_business_connection_id,
    p_telegram_chat_id,
    p_canonical_wa_id,
    p_application_id,
    'queued',
    v_now,
    v_due,
    p_latest_message_id,
    p_latest_update_id,
    0,
    null,
    null,
    null,
    v_now
  )
  on conflict (business_connection_id, telegram_chat_id) do update set
    canonical_wa_id = excluded.canonical_wa_id,
    application_id = excluded.application_id,
    status = 'queued',
    window_started_at = case
      when public.telegram_intelligence_hold_jobs.status = 'idle'
        or public.telegram_intelligence_hold_jobs.window_started_at is null
      then v_now
      else public.telegram_intelligence_hold_jobs.window_started_at
    end,
    due_at = v_due,
    latest_message_id = excluded.latest_message_id,
    latest_update_id = excluded.latest_update_id,
    locked_at = null,
    locked_by = null,
    last_error = null,
    updated_at = v_now
  returning * into v_row;

  return query select true, v_row.due_at, v_row.window_started_at;
end;
$$;

revoke all on function public.enqueue_telegram_intelligence_hold(text,text,text,uuid,bigint,bigint,integer) from public, anon, authenticated;
grant execute on function public.enqueue_telegram_intelligence_hold(text,text,text,uuid,bigint,bigint,integer) to service_role;

create or replace function public.claim_telegram_intelligence_hold_jobs(
  p_worker_id text,
  p_limit integer default 8
)
returns setof public.telegram_intelligence_hold_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.telegram_intelligence_hold_jobs
    where status = 'queued'
      and due_at is not null
      and due_at <= now()
    order by due_at asc
    for update skip locked
    limit greatest(1, least(20, coalesce(p_limit, 8)))
  )
  update public.telegram_intelligence_hold_jobs j
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempt_count = j.attempt_count + 1,
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_telegram_intelligence_hold_jobs(text,integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_intelligence_hold_jobs(text,integer) to service_role;

create or replace function public.complete_telegram_intelligence_hold(p_job_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telegram_intelligence_hold_jobs
  set status = 'idle',
      window_started_at = null,
      due_at = null,
      locked_at = null,
      locked_by = null,
      last_completed_at = now(),
      last_error = null,
      updated_at = now()
  where id = p_job_id
    and status = 'processing';
$$;

revoke all on function public.complete_telegram_intelligence_hold(uuid) from public, anon, authenticated;
grant execute on function public.complete_telegram_intelligence_hold(uuid) to service_role;

create or replace function public.release_telegram_intelligence_hold(p_job_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.telegram_intelligence_hold_jobs
  set status = 'queued',
      due_at = greatest(coalesce(due_at, now()), now() + interval '10 seconds'),
      locked_at = null,
      locked_by = null,
      last_error = left(coalesce(p_error, 'unknown'), 1800),
      updated_at = now()
  where id = p_job_id;
$$;

revoke all on function public.release_telegram_intelligence_hold(uuid,text) from public, anon, authenticated;
grant execute on function public.release_telegram_intelligence_hold(uuid,text) to service_role;

-- One lightweight database scheduler handles both channels. It only calls Vercel
-- when a due job exists, so no function is kept sleeping for the 20-second hold.
create or replace function public.kick_alameen_humanized_intelligence_workers()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_token text;
  v_whatsapp_due boolean := false;
  v_telegram_due boolean := false;
begin
  select value into v_token
  from public.whatsapp_live_ingress_settings
  where key = 'worker_token'
  limit 1;

  if coalesce(v_token, '') = '' then
    return;
  end if;

  select exists (
    select 1
    from public.whatsapp_live_ingress_jobs
    where status in ('queued','retry_wait')
      and next_attempt_at is not null
      and next_attempt_at <= now()
  ) into v_whatsapp_due;

  select exists (
    select 1
    from public.telegram_intelligence_hold_jobs
    where status = 'queued'
      and due_at is not null
      and due_at <= now()
  ) into v_telegram_due;

  if v_whatsapp_due then
    perform net.http_post(
      url := 'https://www.ameenfinance.co/api/internal/whatsapp-live-ingress/worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-alameen-live-worker-token', v_token
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  end if;

  if v_telegram_due then
    perform net.http_post(
      url := 'https://www.ameenfinance.co/api/internal/telegram-intelligence/worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-alameen-live-worker-token', v_token
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  end if;
end;
$$;

revoke all on function public.kick_alameen_humanized_intelligence_workers() from public, anon, authenticated;

-- Idempotently replace the Phase 18.5.1 scheduler if this migration is re-run.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'alameen-humanized-ai-hold-kicker'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;

select cron.schedule(
  'alameen-humanized-ai-hold-kicker',
  '5 seconds',
  $$select public.kick_alameen_humanized_intelligence_workers();$$
);
