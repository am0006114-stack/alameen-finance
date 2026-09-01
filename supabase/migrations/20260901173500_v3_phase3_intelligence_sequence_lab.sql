-- ALAMEEN V3 Phase 3 — Intelligence + Persistent State + Archive Sequence Lab
-- ADDITIVE / EVALUATION INFRASTRUCTURE ONLY.
-- DOES NOT route customer messages to V3.
-- DOES NOT mutate applications, payments, refunds, cancellations, or customer business state.
-- DOES NOT create cron jobs or triggers.
-- Lab starts DISABLED.

DO $$
BEGIN
  IF to_regclass('public.applications') IS NULL THEN
    RAISE EXCEPTION 'WRONG_DATABASE: public.applications is missing';
  END IF;
  IF to_regclass('public.whatsapp_messages') IS NULL THEN
    RAISE EXCEPTION 'WRONG_DATABASE: public.whatsapp_messages is missing';
  END IF;
  IF to_regclass('public.whatsapp_v2_archive_cases') IS NULL THEN
    RAISE EXCEPTION 'V2_ARCHIVE_REQUIRED: public.whatsapp_v2_archive_cases is missing';
  END IF;
  IF to_regclass('public.whatsapp_v2_archive_settings') IS NULL THEN
    RAISE EXCEPTION 'V2_ARCHIVE_SETTINGS_REQUIRED: public.whatsapp_v2_archive_settings is missing';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_conversation_state (
  wa_id text PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_application_id text,
  active_tracking_id text,
  ai_role text,
  runtime_version text NOT NULL DEFAULT 'v3.0.0-phase3-intelligence-sequence-lab',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_v3_conversation_state ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v3_conversation_state_app_idx
  ON public.whatsapp_v3_conversation_state(active_application_id);
CREATE INDEX IF NOT EXISTS whatsapp_v3_conversation_state_updated_idx
  ON public.whatsapp_v3_conversation_state(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_lab_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_v3_lab_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.whatsapp_v3_lab_settings(key,value) VALUES
  ('lab_enabled','false'),
  ('max_turns_per_run','6'),
  ('deepseek_hourly_budget_usd',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='deepseek_hourly_budget_usd'),'0.50')),
  ('deepseek_daily_budget_usd',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='deepseek_daily_budget_usd'),'2.00')),
  ('openai_hourly_budget_usd',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='openai_hourly_budget_usd'),'0.25')),
  ('openai_daily_budget_usd',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='openai_daily_budget_usd'),'1.00')),
  ('deepseek_interpreter_model',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='deepseek_model'),'deepseek-chat')),
  ('deepseek_writer_model',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='deepseek_model'),'deepseek-chat')),
  ('openai_judge_model',coalesce((SELECT value FROM public.whatsapp_v2_archive_settings WHERE key='openai_judge_model'),'')),
  ('deepseek_reserve_per_call_usd','0.010'),
  ('openai_reserve_per_call_usd','0.030')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_archive_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_case_id uuid REFERENCES public.whatsapp_v2_archive_cases(id) ON DELETE SET NULL,
  wa_id text NOT NULL,
  runtime_version text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','succeeded','needs_review','budget_blocked','failed')),
  turn_count integer NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  v3_avg_score numeric(6,2),
  historical_avg_score numeric(6,2),
  critical_failure_count integer NOT NULL DEFAULT 0 CHECK (critical_failure_count >= 0),
  continuity_failure_count integer NOT NULL DEFAULT 0 CHECK (continuity_failure_count >= 0),
  result_json jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.whatsapp_v3_archive_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v3_archive_runs_status_time_idx
  ON public.whatsapp_v3_archive_runs(status,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_v3_archive_runs_wa_idx
  ON public.whatsapp_v3_archive_runs(wa_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_archive_turn_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.whatsapp_v3_archive_runs(id) ON DELETE CASCADE,
  source_case_id uuid REFERENCES public.whatsapp_v2_archive_cases(id) ON DELETE SET NULL,
  turn_index integer NOT NULL CHECK (turn_index > 0),
  customer_message text NOT NULL,
  historical_reply text,
  v3_reply text,
  interpretation jsonb,
  state_before jsonb,
  state_after jsonb,
  historical_truth jsonb,
  plan jsonb,
  action_results jsonb,
  verification jsonb,
  judge_result jsonb,
  v3_score integer CHECK (v3_score BETWEEN 0 AND 100),
  historical_score integer CHECK (historical_score BETWEEN 0 AND 100),
  critical_failures text[] NOT NULL DEFAULT '{}',
  continuity_failures text[] NOT NULL DEFAULT '{}',
  final_safety_pass boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,turn_index)
);
ALTER TABLE public.whatsapp_v3_archive_turn_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v3_archive_turn_results_run_idx
  ON public.whatsapp_v3_archive_turn_results(run_id,turn_index);
CREATE INDEX IF NOT EXISTS whatsapp_v3_archive_turn_results_case_idx
  ON public.whatsapp_v3_archive_turn_results(source_case_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.whatsapp_v3_archive_runs(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('deepseek','openai')),
  model text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('interpreter','writer','judge','repair')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','failed')),
  reserved_usd numeric(12,6) NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.whatsapp_v3_ai_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v3_ai_usage_provider_time_idx
  ON public.whatsapp_v3_ai_usage(provider,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_v3_ai_usage_run_idx
  ON public.whatsapp_v3_ai_usage(run_id,created_at);

CREATE OR REPLACE FUNCTION public.reserve_whatsapp_v3_ai_budget(
  p_provider text,
  p_model text,
  p_purpose text,
  p_run_id uuid,
  p_reserve_usd numeric
)
RETURNS TABLE(
  allowed boolean,
  reservation_id uuid,
  reason text,
  hour_spend numeric,
  day_spend numeric,
  hour_budget numeric,
  day_budget numeric
)
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
    RETURN QUERY SELECT false,NULL::uuid,'invalid_provider',0::numeric,0::numeric,0::numeric,0::numeric;
    RETURN;
  END IF;

  IF p_purpose NOT IN ('interpreter','writer','judge','repair') THEN
    RETURN QUERY SELECT false,NULL::uuid,'invalid_purpose',0::numeric,0::numeric,0::numeric,0::numeric;
    RETURN;
  END IF;

  IF coalesce(p_reserve_usd,0) <= 0 THEN
    RETURN QUERY SELECT false,NULL::uuid,'invalid_reserve',0::numeric,0::numeric,0::numeric,0::numeric;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('alameen_v3_cost_guard_'||p_provider));

  SELECT coalesce(value,'false')::boolean INTO v_enabled
  FROM public.whatsapp_v3_lab_settings WHERE key='lab_enabled';
  IF NOT coalesce(v_enabled,false) THEN
    RETURN QUERY SELECT false,NULL::uuid,'lab_disabled',0::numeric,0::numeric,0::numeric,0::numeric;
    RETURN;
  END IF;

  SELECT value::numeric INTO v_hour_budget
  FROM public.whatsapp_v3_lab_settings WHERE key=p_provider||'_hourly_budget_usd';
  SELECT value::numeric INTO v_day_budget
  FROM public.whatsapp_v3_lab_settings WHERE key=p_provider||'_daily_budget_usd';

  v_hour_budget := coalesce(v_hour_budget,0);
  v_day_budget := coalesce(v_day_budget,0);

  SELECT coalesce(sum(estimated_cost_usd),0) INTO v_hour_spend
  FROM public.whatsapp_v3_ai_usage
  WHERE provider=p_provider
    AND created_at >= now()-interval '1 hour'
    AND status IN ('reserved','completed');

  SELECT coalesce(sum(estimated_cost_usd),0) INTO v_day_spend
  FROM public.whatsapp_v3_ai_usage
  WHERE provider=p_provider
    AND created_at >= date_trunc('day',now())
    AND status IN ('reserved','completed');

  IF v_hour_spend + p_reserve_usd > v_hour_budget THEN
    RETURN QUERY SELECT false,NULL::uuid,'hourly_budget_exceeded',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
    RETURN;
  END IF;

  IF v_day_spend + p_reserve_usd > v_day_budget THEN
    RETURN QUERY SELECT false,NULL::uuid,'daily_budget_exceeded',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
    RETURN;
  END IF;

  INSERT INTO public.whatsapp_v3_ai_usage(run_id,provider,model,purpose,status,reserved_usd,estimated_cost_usd)
  VALUES(p_run_id,p_provider,p_model,p_purpose,'reserved',p_reserve_usd,p_reserve_usd)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT true,v_id,'allowed',v_hour_spend,v_day_spend,v_hour_budget,v_day_budget;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_whatsapp_v3_ai_budget(text,text,text,uuid,numeric)
  FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_whatsapp_v3_ai_budget(text,text,text,uuid,numeric)
  TO service_role;
