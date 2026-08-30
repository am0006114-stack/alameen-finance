-- ALAMEEN V2 Phase 2 - Archive Evaluation Lab + Cost Guard
-- Additive evaluation-only schema. Does not mutate applications/payment/refund/cancellation.

DO $$
BEGIN
  IF to_regclass('public.applications') IS NULL THEN
    RAISE EXCEPTION 'WRONG_DATABASE: public.applications is missing';
  END IF;
  IF to_regclass('public.whatsapp_messages') IS NULL THEN
    RAISE EXCEPTION 'WRONG_DATABASE: public.whatsapp_messages is missing';
  END IF;
  IF to_regclass('public.whatsapp_v2_shadow_jobs') IS NULL THEN
    RAISE EXCEPTION 'BASE_V2_MISSING: public.whatsapp_v2_shadow_jobs is missing';
  END IF;
END $$;

-- Safety first: keep all production shadow automation OFF.
DROP TRIGGER IF EXISTS trg_kick_legacy_whatsapp_shadow_worker ON public.whatsapp_shadow_jobs;
DROP TRIGGER IF EXISTS trg_kick_v2_whatsapp_shadow_worker ON public.whatsapp_v2_shadow_jobs;

DO $$
DECLARE v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job
      WHERE jobname IN ('alameen-whatsapp-shadow-worker','alameen-whatsapp-v2-shadow-worker','alameen-v2-archive-worker')
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_v2_archive_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_v2_archive_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.whatsapp_v2_archive_settings(key,value) VALUES
  ('lab_enabled','false'),
  ('archive_cutoff', now()::text),
  ('deepseek_hourly_budget_usd','0.50'),
  ('deepseek_daily_budget_usd','2.00'),
  ('openai_hourly_budget_usd','0.25'),
  ('openai_daily_budget_usd','1.00'),
  ('max_cases_per_worker','3'),
  ('deepseek_model','deepseek-v4-pro'),
  ('openai_judge_model','gpt-5.6-luna'),
  ('openai_adjudicator_model','gpt-5.6-terra'),
  ('terra_adjudication_enabled','true')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_v2_archive_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id uuid NOT NULL UNIQUE,
  source_created_at timestamptz NOT NULL,
  wa_id text NOT NULL,
  customer_name text,
  customer_message text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  actual_intent text,
  actual_reply text,
  application_id text,
  tracking_id text,
  historical_truth jsonb NOT NULL DEFAULT '{}'::jsonb,
  historical_truth_confidence text NOT NULL DEFAULT 'limited' CHECK (historical_truth_confidence IN ('high','medium','limited','none')),
  historical_truth_source text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','succeeded','needs_review','budget_blocked','skipped','retry_wait','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  next_attempt_at timestamptz DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  context_snapshot jsonb,
  deterministic_anchor jsonb,
  deepseek_result jsonb,
  candidate_reply text,
  openai_judge jsonb,
  openai_adjudication jsonb,
  actual_score integer CHECK (actual_score BETWEEN 0 AND 100),
  candidate_score integer CHECK (candidate_score BETWEEN 0 AND 100),
  score_delta integer,
  winner text CHECK (winner IN ('actual','candidate','tie') OR winner IS NULL),
  judge_confidence numeric,
  critical_actual text[] NOT NULL DEFAULT '{}',
  critical_candidate text[] NOT NULL DEFAULT '{}',
  failure_tags text[] NOT NULL DEFAULT '{}',
  deepseek_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  openai_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  total_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.whatsapp_v2_archive_cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v2_archive_cases_status_idx ON public.whatsapp_v2_archive_cases(status,next_attempt_at,source_created_at);
CREATE INDEX IF NOT EXISTS whatsapp_v2_archive_cases_wa_idx ON public.whatsapp_v2_archive_cases(wa_id,source_created_at);
CREATE INDEX IF NOT EXISTS whatsapp_v2_archive_cases_score_idx ON public.whatsapp_v2_archive_cases(candidate_score,actual_score);

CREATE TABLE IF NOT EXISTS public.whatsapp_v2_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.whatsapp_v2_archive_cases(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('deepseek','openai')),
  model text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','failed')),
  input_tokens integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  request_id text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.whatsapp_v2_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v2_ai_usage_provider_time_idx ON public.whatsapp_v2_ai_usage(provider,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_v2_ai_usage_case_idx ON public.whatsapp_v2_ai_usage(case_id,created_at);

CREATE OR REPLACE FUNCTION public.seed_whatsapp_v2_archive_cases(p_before timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before timestamptz;
  v_count integer;
BEGIN
  IF p_before IS NULL THEN
    SELECT value::timestamptz INTO v_before FROM public.whatsapp_v2_archive_settings WHERE key='archive_cutoff';
  ELSE
    v_before := p_before;
  END IF;
  IF v_before IS NULL THEN v_before := now(); END IF;

  INSERT INTO public.whatsapp_v2_archive_cases(
    source_message_id, source_created_at, wa_id, customer_name, customer_message, message_type,
    actual_intent, actual_reply, application_id, tracking_id,
    historical_truth, historical_truth_confidence, historical_truth_source
  )
  SELECT
    i.id,
    i.created_at,
    i.wa_id,
    i.customer_name,
    coalesce(i.body,''),
    coalesce(nullif(i.message_type,''),'text'),
    i.intent,
    reply.body,
    coalesce(i.application_id::text, app.id::text),
    coalesce(i.tracking_id, app.tracking_id),
    jsonb_strip_nulls(jsonb_build_object(
      'application_id', coalesce(i.application_id::text, app.id::text),
      'tracking_id', coalesce(i.tracking_id, app.tracking_id),
      'status', coalesce(next_audit.old_status, app.status),
      'payment_status', coalesce(next_audit.old_payment_status, app.payment_status),
      'payment_confirmed_at', coalesce(next_audit.old_payment_confirmed_at, app.payment_confirmed_at),
      'device_name', app.device_name,
      'installment_months', app.installment_months,
      'monthly_payment', app.monthly_payment,
      'device_price', app.device_price,
      'delivery_delay_until', app.delivery_delay_until,
      'application_created_at', app.created_at,
      'turn_time', i.created_at
    )),
    CASE
      WHEN app.id IS NULL THEN 'none'
      WHEN i.created_at >= timestamptz '2026-08-10 12:30:00+03' AND next_audit.id IS NOT NULL THEN 'high'
      WHEN i.created_at >= timestamptz '2026-08-10 12:30:00+03' THEN 'medium'
      ELSE 'limited'
    END,
    CASE
      WHEN app.id IS NULL THEN 'no_application_snapshot'
      WHEN next_audit.id IS NOT NULL THEN 'next_audit_old_state_plus_application_snapshot'
      ELSE 'current_application_snapshot_no_later_state_audit'
    END
  FROM public.whatsapp_messages i
  LEFT JOIN LATERAL (
    SELECT a.* FROM public.applications a
    WHERE (i.application_id IS NOT NULL AND a.id = i.application_id)
       OR (i.tracking_id IS NOT NULL AND a.tracking_id = i.tracking_id)
    ORDER BY CASE WHEN i.application_id IS NOT NULL AND a.id=i.application_id THEN 0 ELSE 1 END
    LIMIT 1
  ) app ON true
  LEFT JOIN LATERAL (
    SELECT s.* FROM public.application_state_audit s
    WHERE app.id IS NOT NULL
      AND s.application_id = app.id::text
      AND s.changed_at > i.created_at
    ORDER BY s.changed_at ASC
    LIMIT 1
  ) next_audit ON true
  LEFT JOIN LATERAL (
    SELECT o.body FROM public.whatsapp_messages o
    WHERE o.wa_id=i.wa_id
      AND o.direction='outgoing'
      AND o.created_at > i.created_at
      AND o.created_at < coalesce((
        SELECT min(n.created_at) FROM public.whatsapp_messages n
        WHERE n.wa_id=i.wa_id AND n.direction='incoming' AND n.created_at > i.created_at
      ), i.created_at + interval '6 hours')
      AND coalesce(trim(o.body),'') <> ''
    ORDER BY o.created_at ASC
    LIMIT 1
  ) reply ON true
  WHERE i.direction='incoming'
    AND i.created_at < v_before
    AND coalesce(trim(i.wa_id),'') <> ''
    AND coalesce(trim(i.body),'') <> ''
  ON CONFLICT (source_message_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_whatsapp_v2_archive_cases(timestamptz) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seed_whatsapp_v2_archive_cases(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_v2_archive_cases(p_worker_id text, p_limit integer DEFAULT 1)
RETURNS SETOF public.whatsapp_v2_archive_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  RETURN QUERY
  WITH selected AS (
    SELECT id FROM public.whatsapp_v2_archive_cases
    WHERE status IN ('queued','retry_wait','budget_blocked')
      AND coalesce(next_attempt_at,now()) <= now()
      AND attempt_count < max_attempts
    ORDER BY source_created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1,least(coalesce(p_limit,1),5))
  ), claimed AS (
    UPDATE public.whatsapp_v2_archive_cases c
    SET status='processing', attempt_count=c.attempt_count+1, locked_at=now(), locked_by=p_worker_id, updated_at=now()
    FROM selected s WHERE c.id=s.id RETURNING c.*
  ) SELECT * FROM claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_whatsapp_v2_archive_cases(text,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_v2_archive_cases(text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_whatsapp_v2_ai_budget(
  p_provider text,
  p_model text,
  p_purpose text,
  p_case_id uuid,
  p_reserve_usd numeric
)
RETURNS TABLE(allowed boolean,reservation_id uuid,reason text,hour_spend numeric,day_spend numeric,hour_budget numeric,day_budget numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_enabled boolean;
  v_hour_budget numeric;
  v_day_budget numeric;
  v_hour_spend numeric;
  v_day_spend numeric;
  v_id uuid;
BEGIN
  IF p_provider NOT IN ('deepseek','openai') THEN
    RETURN QUERY SELECT false,NULL::uuid,'invalid_provider',0::numeric,0::numeric,0::numeric,0::numeric; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('alameen_v2_cost_guard_'||p_provider));
  SELECT coalesce(value,'false')::boolean INTO v_enabled FROM public.whatsapp_v2_archive_settings WHERE key='lab_enabled';
  IF NOT coalesce(v_enabled,false) THEN
    RETURN QUERY SELECT false,NULL::uuid,'lab_disabled',0::numeric,0::numeric,0::numeric,0::numeric; RETURN;
  END IF;

  SELECT value::numeric INTO v_hour_budget FROM public.whatsapp_v2_archive_settings WHERE key=p_provider||'_hourly_budget_usd';
  SELECT value::numeric INTO v_day_budget FROM public.whatsapp_v2_archive_settings WHERE key=p_provider||'_daily_budget_usd';
  v_hour_budget := coalesce(v_hour_budget,0);
  v_day_budget := coalesce(v_day_budget,0);

  SELECT coalesce(sum(estimated_cost_usd),0) INTO v_hour_spend FROM public.whatsapp_v2_ai_usage
   WHERE provider=p_provider AND created_at >= now()-interval '1 hour' AND status IN ('reserved','completed');
  SELECT coalesce(sum(estimated_cost_usd),0) INTO v_day_spend FROM public.whatsapp_v2_ai_usage
   WHERE provider=p_provider AND created_at >= date_trunc('day',now()) AND status IN ('reserved','completed');

  IF v_hour_spend + p_reserve_usd > v_hour_budget THEN
    RETURN QUERY SELECT false,NULL::uuid,'hourly_budget_exceeded',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget; RETURN;
  END IF;
  IF v_day_spend + p_reserve_usd > v_day_budget THEN
    RETURN QUERY SELECT false,NULL::uuid,'daily_budget_exceeded',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget; RETURN;
  END IF;

  INSERT INTO public.whatsapp_v2_ai_usage(case_id,provider,model,purpose,status,reserved_usd,estimated_cost_usd)
  VALUES(p_case_id,p_provider,p_model,p_purpose,'reserved',p_reserve_usd,p_reserve_usd)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT true,v_id,'allowed',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_whatsapp_v2_ai_budget(text,text,text,uuid,numeric) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_whatsapp_v2_ai_budget(text,text,text,uuid,numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_stale_whatsapp_v2_archive_cases(p_stale_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.whatsapp_v2_archive_cases
  SET status=CASE WHEN attempt_count>=max_attempts THEN 'dead_letter' ELSE 'retry_wait' END,
      next_attempt_at=CASE WHEN attempt_count>=max_attempts THEN NULL ELSE now() END,
      locked_at=NULL,locked_by=NULL,updated_at=now(),
      last_error_code=coalesce(last_error_code,'stale_archive_lock'),
      last_error_message=coalesce(last_error_message,'Archive worker lock expired.'),
      completed_at=CASE WHEN attempt_count>=max_attempts THEN now() ELSE completed_at END
  WHERE status='processing' AND locked_at < now()-make_interval(mins=>greatest(1,coalesce(p_stale_minutes,10)));
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.requeue_stale_whatsapp_v2_archive_cases(integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stale_whatsapp_v2_archive_cases(integer) TO service_role;
