-- Pro vs Flash A/B experiment for Al-Ameen Shadow.
-- Safe to run more than once.

set search_path = public, extensions;

alter table public.whatsapp_shadow_jobs
  add column if not exists experiment_key text,
  add column if not exists comparison_group_id text,
  add column if not exists variant text not null default 'primary',
  add column if not exists requested_model text;

alter table public.whatsapp_shadow_jobs
  drop constraint if exists whatsapp_shadow_jobs_incoming_message_id_key;

create unique index if not exists whatsapp_shadow_jobs_message_variant_uidx
  on public.whatsapp_shadow_jobs (incoming_message_id, variant);

create index if not exists whatsapp_shadow_jobs_experiment_idx
  on public.whatsapp_shadow_jobs (experiment_key, comparison_group_id, variant, created_at);

insert into public.whatsapp_shadow_settings (key, value)
values
  ('ab_test_enabled', 'true'),
  ('ab_test_target_messages', '30'),
  ('ab_test_key', 'pro-vs-flash-20260803'),
  ('ab_primary_model', 'deepseek-v4-pro'),
  ('ab_secondary_model', 'deepseek-v4-flash')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.enqueue_whatsapp_shadow_experiment(
  p_incoming_message_id text,
  p_wa_id text,
  p_customer_name text,
  p_customer_message text,
  p_message_type text,
  p_actual_reply text,
  p_initial_intent text,
  p_tracking_id text,
  p_application_id text,
  p_application_snapshot jsonb,
  p_conversation_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_target integer := 30;
  v_key text := 'pro-vs-flash-20260803';
  v_primary text := 'deepseek-v4-pro';
  v_secondary text := 'deepseek-v4-flash';
  v_current integer := 0;
  v_inserted integer := 0;
begin
  if coalesce(trim(p_incoming_message_id), '') = '' then
    raise exception 'p_incoming_message_id is required';
  end if;

  -- One message must never be enqueued twice, even if the webhook is retried.
  perform pg_advisory_xact_lock(hashtext('alameen-whatsapp-shadow-ab-enqueue'));

  if exists (
    select 1
    from public.whatsapp_shadow_jobs
    where incoming_message_id = p_incoming_message_id
  ) then
    return jsonb_build_object('mode', 'existing', 'inserted', 0);
  end if;

  select coalesce((select value::boolean from public.whatsapp_shadow_settings where key = 'ab_test_enabled'), true)
    into v_enabled;
  select greatest(1, least(200, coalesce((select value::integer from public.whatsapp_shadow_settings where key = 'ab_test_target_messages'), 30)))
    into v_target;
  select coalesce((select value from public.whatsapp_shadow_settings where key = 'ab_test_key'), v_key)
    into v_key;
  select coalesce((select value from public.whatsapp_shadow_settings where key = 'ab_primary_model'), v_primary)
    into v_primary;
  select coalesce((select value from public.whatsapp_shadow_settings where key = 'ab_secondary_model'), v_secondary)
    into v_secondary;

  select count(distinct incoming_message_id)
    into v_current
  from public.whatsapp_shadow_jobs
  where experiment_key = v_key
    and variant = 'pro';

  if v_enabled and v_current < v_target then
    insert into public.whatsapp_shadow_jobs (
      incoming_message_id,
      wa_id,
      customer_name,
      customer_message,
      message_type,
      actual_reply,
      initial_intent,
      tracking_id,
      application_id,
      application_snapshot,
      conversation_snapshot,
      status,
      next_attempt_at,
      experiment_key,
      comparison_group_id,
      variant,
      requested_model
    )
    values
      (
        p_incoming_message_id,
        p_wa_id,
        p_customer_name,
        p_customer_message,
        coalesce(nullif(p_message_type, ''), 'text'),
        p_actual_reply,
        p_initial_intent,
        p_tracking_id,
        p_application_id,
        coalesce(p_application_snapshot, '{}'::jsonb),
        coalesce(p_conversation_snapshot, '{}'::jsonb),
        'queued',
        now(),
        v_key,
        p_incoming_message_id,
        'pro',
        v_primary
      ),
      (
        p_incoming_message_id,
        p_wa_id,
        p_customer_name,
        p_customer_message,
        coalesce(nullif(p_message_type, ''), 'text'),
        p_actual_reply,
        p_initial_intent,
        p_tracking_id,
        p_application_id,
        coalesce(p_application_snapshot, '{}'::jsonb),
        coalesce(p_conversation_snapshot, '{}'::jsonb),
        'queued',
        now(),
        v_key,
        p_incoming_message_id,
        'flash',
        v_secondary
      )
    on conflict (incoming_message_id, variant) do nothing;

    get diagnostics v_inserted = row_count;

    return jsonb_build_object(
      'mode', 'ab',
      'experiment_key', v_key,
      'inserted', v_inserted,
      'progress_before_insert', v_current,
      'target', v_target
    );
  end if;

  -- After the experiment target is reached, the primary Shadow path uses Pro.
  -- The provider may fall back to Flash only when the Pro call fails technically.
  insert into public.whatsapp_shadow_jobs (
    incoming_message_id,
    wa_id,
    customer_name,
    customer_message,
    message_type,
    actual_reply,
    initial_intent,
    tracking_id,
    application_id,
    application_snapshot,
    conversation_snapshot,
    status,
    next_attempt_at,
    experiment_key,
    comparison_group_id,
    variant,
    requested_model
  )
  values (
    p_incoming_message_id,
    p_wa_id,
    p_customer_name,
    p_customer_message,
    coalesce(nullif(p_message_type, ''), 'text'),
    p_actual_reply,
    p_initial_intent,
    p_tracking_id,
    p_application_id,
    coalesce(p_application_snapshot, '{}'::jsonb),
    coalesce(p_conversation_snapshot, '{}'::jsonb),
    'queued',
    now(),
    null,
    p_incoming_message_id,
    'primary',
    null
  )
  on conflict (incoming_message_id, variant) do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'mode', 'primary',
    'inserted', v_inserted,
    'experiment_key', v_key,
    'progress', v_current,
    'target', v_target
  );
end;
$$;

revoke all on function public.enqueue_whatsapp_shadow_experiment(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.enqueue_whatsapp_shadow_experiment(
  text, text, text, text, text, text, text, text, text, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';
