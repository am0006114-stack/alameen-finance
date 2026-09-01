-- ALAMEEN V3 Phase 5.1 — Transactional Action Engine + Payment Truth Integrity + Audit Ledger + Discord Dedupe
-- ADDITIVE INFRASTRUCTURE ONLY. Does not enable V3 routing, does not create cron/trigger,
-- and does not execute any business action by itself.

DO $$
BEGIN
  IF to_regclass('public.applications') IS NULL THEN RAISE EXCEPTION 'WRONG_DATABASE: public.applications is missing'; END IF;
  IF to_regclass('public.whatsapp_v3_lab_settings') IS NULL THEN RAISE EXCEPTION 'V3_PHASE3_REQUIRED: whatsapp_v3_lab_settings missing'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_action_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  source_turn_id text,
  wa_id text NOT NULL,
  application_id text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('cancel_application','continue_application','request_refund','stop_refund','change_application_data','change_device','reopen_application')),
  owner_role text NOT NULL DEFAULT 'omran' CHECK (owner_role='omran'),
  runtime_version text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','executing','executed','already_done','blocked','failed')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb,
  blocker text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);
ALTER TABLE public.whatsapp_v3_action_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v3_action_ledger_app_time_idx ON public.whatsapp_v3_action_ledger(application_id,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_v3_action_ledger_wa_time_idx ON public.whatsapp_v3_action_ledger(wa_id,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_v3_action_ledger_status_time_idx ON public.whatsapp_v3_action_ledger(status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_v3_notification_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  application_id text,
  wa_id text,
  severity text NOT NULL CHECK (severity IN ('info','important','critical')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE public.whatsapp_v3_notification_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS whatsapp_v3_notification_ledger_status_time_idx ON public.whatsapp_v3_notification_ledger(status,created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_v3_notification_ledger_app_time_idx ON public.whatsapp_v3_notification_ledger(application_id,created_at DESC);

-- Remove the superseded pre-5.1 overload if it was ever installed.
-- V3 is not live yet, so retaining a weaker callable signature is unnecessary risk.
DROP FUNCTION IF EXISTS public.execute_whatsapp_v3_application_action(text,text,text,text,text,jsonb,jsonb,text);

CREATE OR REPLACE FUNCTION public.execute_whatsapp_v3_application_action(
  p_idempotency_key text,
  p_application_id text,
  p_wa_id text,
  p_source_turn_id text,
  p_action_type text,
  p_owner_role text,
  p_expected_before jsonb,
  p_payload jsonb,
  p_runtime_version text
)
RETURNS TABLE(ledger_id uuid, outcome text, blocker text, summary text, after_snapshot jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_ledger uuid;
  v_existing public.whatsapp_v3_action_ledger%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_paid boolean;
  v_outcome text := 'executed';
  v_summary text := null;
  v_blocker text := null;
  v_status text;
  v_payment_status text;
  v_refund_state boolean;
BEGIN
  IF coalesce(trim(p_idempotency_key),'')='' OR coalesce(trim(p_application_id),'')='' OR coalesce(trim(p_wa_id),'')='' THEN
    RAISE EXCEPTION 'v3_invalid_action_identity';
  END IF;
  IF p_action_type NOT IN ('cancel_application','continue_application','request_refund','stop_refund','change_application_data','change_device','reopen_application') THEN
    RAISE EXCEPTION 'v3_unsupported_action:%', p_action_type;
  END IF;
  IF coalesce(p_owner_role,'') <> 'omran' THEN
    RAISE EXCEPTION 'v3_omran_supervisor_required';
  END IF;
  IF lower(coalesce(p_action_type,'')) IN ('confirm_payment','payment_confirmed','confirm_receipt') THEN
    RAISE EXCEPTION 'v3_payment_confirmation_is_admin_only';
  END IF;

  INSERT INTO public.whatsapp_v3_action_ledger(idempotency_key,source_turn_id,wa_id,application_id,action_type,owner_role,runtime_version,status,request_payload,expected_before)
  VALUES(p_idempotency_key,p_source_turn_id,p_wa_id,p_application_id,p_action_type,p_owner_role,coalesce(p_runtime_version,'v3-unknown'),'requested',coalesce(p_payload,'{}'::jsonb),coalesce(p_expected_before,'{}'::jsonb))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ledger;

  IF v_ledger IS NULL THEN
    SELECT * INTO v_existing FROM public.whatsapp_v3_action_ledger WHERE idempotency_key=p_idempotency_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'v3_idempotency_claim_failed'; END IF;
    RETURN QUERY SELECT v_existing.id,
      CASE WHEN v_existing.status='executed' THEN 'executed' WHEN v_existing.status='already_done' THEN 'already_done' ELSE v_existing.status END,
      CASE WHEN v_existing.status IN ('requested','executing') THEN 'same_action_already_in_progress' ELSE v_existing.blocker END,
      CASE WHEN v_existing.status IN ('executed','already_done') THEN 'الإجراء مسجل مسبقًا بنفس الرسالة ولم يتم تنفيذه مرتين.' ELSE null END,
      v_existing.after_snapshot;
    RETURN;
  END IF;

  SELECT to_jsonb(a) INTO v_before FROM public.applications a WHERE a.id::text=p_application_id FOR UPDATE;
  IF v_before IS NULL THEN
    UPDATE public.whatsapp_v3_action_ledger SET status='blocked', blocker='application_not_found', updated_at=now() WHERE id=v_ledger;
    RETURN QUERY SELECT v_ledger,'blocked','application_not_found',null::text,null::jsonb; RETURN;
  END IF;

  UPDATE public.whatsapp_v3_action_ledger SET status='executing',before_snapshot=v_before,updated_at=now() WHERE id=v_ledger;

  -- Optimistic truth gate after row lock. A newly changed authoritative field blocks stale AI execution.
  IF (p_expected_before ? 'status') AND coalesce(v_before->>'status','') IS DISTINCT FROM coalesce(p_expected_before->>'status','') THEN v_blocker:='stale_truth_status'; END IF;
  IF v_blocker IS NULL AND (p_expected_before ? 'payment_status') AND coalesce(v_before->>'payment_status','') IS DISTINCT FROM coalesce(p_expected_before->>'payment_status','') THEN v_blocker:='stale_truth_payment_status'; END IF;
  IF v_blocker IS NULL AND (p_expected_before ? 'payment_confirmed_at') AND coalesce(v_before->>'payment_confirmed_at','') IS DISTINCT FROM coalesce(p_expected_before->>'payment_confirmed_at','') THEN v_blocker:='stale_truth_payment_confirmation'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'device_id') AND coalesce(v_before->>'device_id','') IS DISTINCT FROM coalesce(p_expected_before->>'device_id','') THEN v_blocker:='stale_truth_device_id'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'device_name') AND coalesce(v_before->>'device_name','') IS DISTINCT FROM coalesce(p_expected_before->>'device_name','') THEN v_blocker:='stale_truth_device_name'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'device_price') AND coalesce(v_before->>'device_price','') IS DISTINCT FROM coalesce(p_expected_before->>'device_price','') THEN v_blocker:='stale_truth_device_price'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'installment_months') AND coalesce(v_before->>'installment_months','') IS DISTINCT FROM coalesce(p_expected_before->>'installment_months','') THEN v_blocker:='stale_truth_installment_months'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'down_payment') AND coalesce(v_before->>'down_payment','') IS DISTINCT FROM coalesce(p_expected_before->>'down_payment','') THEN v_blocker:='stale_truth_down_payment'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'interest_rate') AND coalesce(v_before->>'interest_rate','') IS DISTINCT FROM coalesce(p_expected_before->>'interest_rate','') THEN v_blocker:='stale_truth_interest_rate'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'monthly_payment') AND coalesce(v_before->>'monthly_payment','') IS DISTINCT FROM coalesce(p_expected_before->>'monthly_payment','') THEN v_blocker:='stale_truth_monthly_payment'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_device' AND (p_expected_before ? 'total_with_interest') AND coalesce(v_before->>'total_with_interest','') IS DISTINCT FROM coalesce(p_expected_before->>'total_with_interest','') THEN v_blocker:='stale_truth_total_with_interest'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_application_data' AND (p_expected_before ? 'phone') AND coalesce(v_before->>'phone','') IS DISTINCT FROM coalesce(p_expected_before->>'phone','') THEN v_blocker:='stale_truth_phone'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_application_data' AND (p_expected_before ? 'full_name') AND coalesce(v_before->>'full_name','') IS DISTINCT FROM coalesce(p_expected_before->>'full_name','') THEN v_blocker:='stale_truth_full_name'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_application_data' AND (p_expected_before ? 'email') AND coalesce(v_before->>'email','') IS DISTINCT FROM coalesce(p_expected_before->>'email','') THEN v_blocker:='stale_truth_email'; END IF;
  IF v_blocker IS NULL AND p_action_type='change_application_data' AND (p_expected_before ? 'salary') AND coalesce(v_before->>'salary','') IS DISTINCT FROM coalesce(p_expected_before->>'salary','') THEN v_blocker:='stale_truth_salary'; END IF;
  IF v_blocker IS NOT NULL THEN
    UPDATE public.whatsapp_v3_action_ledger SET status='blocked',blocker=v_blocker,updated_at=now() WHERE id=v_ledger;
    RETURN QUERY SELECT v_ledger,'blocked',v_blocker,null::text,v_before; RETURN;
  END IF;

  v_status := coalesce(v_before->>'status','');
  v_payment_status := coalesce(v_before->>'payment_status','');
  -- Only an admin-confirmed payment fact is authoritative. Refund workflow
  -- states are never allowed to bootstrap themselves into payment evidence.
  v_paid := coalesce(v_before->>'payment_confirmed_at','')<>'' OR v_payment_status IN ('confirmed','paid','payment_confirmed');
  v_refund_state := v_status IN ('refund_requested','refund_completed') OR v_payment_status IN ('refund_requested','refund_completed');

  -- Historical/corrupt rows with refund state but no authoritative payment
  -- confirmation must fail closed and be reviewed by administration.
  IF v_refund_state AND NOT v_paid THEN
    UPDATE public.whatsapp_v3_action_ledger
      SET status='blocked', blocker='payment_refund_integrity_conflict_requires_admin', updated_at=now()
      WHERE id=v_ledger;
    RETURN QUERY SELECT v_ledger,'blocked','payment_refund_integrity_conflict_requires_admin',null::text,v_before; RETURN;
  END IF;

  BEGIN
    IF p_action_type='cancel_application' THEN
      IF v_status='cancelled' AND v_paid AND v_payment_status='refund_requested' THEN
        v_outcome:='already_done'; v_summary:='الطلب ملغي ومسار الاسترداد مسجل أصلًا.';
      ELSIF v_status='cancelled' AND NOT v_paid THEN
        v_outcome:='already_done'; v_summary:='الطلب ملغي أصلًا ولا يوجد دفع مؤكد لفتح استرداد.';
      ELSE
        UPDATE public.applications SET status='cancelled', payment_status=CASE WHEN v_paid THEN 'refund_requested' ELSE coalesce(nullif(v_payment_status,''),'not_requested_yet') END WHERE id::text=p_application_id;
        v_summary:=CASE WHEN v_paid THEN 'تم إلغاء الطلب وفتح مسار الاسترداد لأن الدفع مؤكد إداريًا.' ELSE 'تم إلغاء الطلب بدون فتح استرداد لعدم وجود دفع مؤكد.' END;
      END IF;

    ELSIF p_action_type='request_refund' THEN
      IF NOT v_paid THEN v_outcome:='blocked'; v_blocker:='confirmed_payment_required';
      ELSIF v_status='refund_completed' OR v_payment_status='refund_completed' THEN v_outcome:='already_done'; v_summary:='الاسترداد مكتمل أصلًا.';
      ELSIF v_status='refund_requested' OR v_payment_status='refund_requested' THEN v_outcome:='already_done'; v_summary:='طلب الاسترداد مسجل أصلًا.';
      ELSE UPDATE public.applications SET status='refund_requested',payment_status='refund_requested' WHERE id::text=p_application_id; v_summary:='تم تسجيل طلب الاسترداد.'; END IF;

    ELSIF p_action_type IN ('stop_refund','reopen_application','continue_application') THEN
      IF v_status='refund_completed' OR v_payment_status='refund_completed' THEN v_outcome:='blocked'; v_blocker:='refund_already_completed_same_application_cannot_reopen';
      ELSIF v_status='refund_requested' OR v_payment_status='refund_requested' THEN
        IF NOT v_paid THEN v_outcome:='blocked'; v_blocker:='refund_state_without_confirmed_payment_integrity_block';
        ELSE UPDATE public.applications SET status='customer_confirmed_continue',payment_status='confirmed' WHERE id::text=p_application_id; v_summary:='تم إيقاف مسار الاسترداد وإعادة تفعيل الطلب.'; END IF;
      ELSIF v_status='cancelled' THEN
        UPDATE public.applications SET status='customer_confirmed_continue',payment_status=CASE WHEN v_paid THEN 'confirmed' ELSE 'payment_info_sent' END WHERE id::text=p_application_id;
        v_summary:='تم التراجع عن الإلغاء وإعادة تفعيل الطلب.';
      ELSIF p_action_type='continue_application' AND v_status='preliminary_qualified' THEN
        UPDATE public.applications SET status='customer_confirmed_continue',payment_status='payment_info_sent' WHERE id::text=p_application_id; v_summary:='تم تسجيل رغبة الاستمرار.';
      ELSIF v_status='customer_confirmed_continue' THEN v_outcome:='already_done'; v_summary:='الطلب مستمر أصلًا.';
      ELSE v_outcome:='blocked'; v_blocker:='application_state_not_eligible_for_continue_or_reopen'; END IF;

    ELSIF p_action_type='change_application_data' THEN
      IF NOT (p_payload ?| array['full_name','phone','email','salary']) THEN v_outcome:='blocked'; v_blocker:='supported_application_patch_required';
      ELSIF (p_payload ? 'phone') AND (p_payload->>'phone') !~ '^07[789][0-9]{7}$' THEN v_outcome:='blocked'; v_blocker:='invalid_jordan_phone';
      ELSIF (p_payload ? 'email') AND (p_payload->>'email') !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN v_outcome:='blocked'; v_blocker:='invalid_email';
      ELSE
        UPDATE public.applications SET
          full_name=CASE WHEN p_payload ? 'full_name' THEN p_payload->>'full_name' ELSE full_name END,
          phone=CASE WHEN p_payload ? 'phone' THEN p_payload->>'phone' ELSE phone END,
          email=CASE WHEN p_payload ? 'email' THEN p_payload->>'email' ELSE email END,
          salary=CASE WHEN p_payload ? 'salary' THEN (p_payload->>'salary')::numeric ELSE salary END
        WHERE id::text=p_application_id;
        v_summary:='تم تعديل بيانات الطلب المسموح بها.';
      END IF;

    ELSIF p_action_type='change_device' THEN
      IF NOT (p_payload ?& array['device_id','device_name','device_price','installment_months','down_payment','interest_rate','monthly_payment','total_with_interest']) THEN
        v_outcome:='blocked'; v_blocker:='complete_official_recalculation_payload_required';
      ELSE
        UPDATE public.applications SET
          device_id=p_payload->>'device_id', device_name=p_payload->>'device_name',
          device_price=(p_payload->>'device_price')::numeric, installment_months=(p_payload->>'installment_months')::integer,
          down_payment=(p_payload->>'down_payment')::numeric, interest_rate=(p_payload->>'interest_rate')::numeric,
          monthly_payment=(p_payload->>'monthly_payment')::numeric, total_with_interest=(p_payload->>'total_with_interest')::numeric
        WHERE id::text=p_application_id;
        v_summary:='تم تغيير الجهاز وتطبيق الحسبة الرسمية الجديدة.';
      END IF;
    END IF;
  EXCEPTION WHEN others THEN
    UPDATE public.whatsapp_v3_action_ledger SET status='failed',error_message=SQLERRM,updated_at=now() WHERE id=v_ledger;
    RETURN QUERY SELECT v_ledger,'failed','database_mutation_exception',null::text,v_before; RETURN;
  END;

  SELECT to_jsonb(a) INTO v_after FROM public.applications a WHERE a.id::text=p_application_id;
  UPDATE public.whatsapp_v3_action_ledger SET
    status=CASE WHEN v_outcome='executed' THEN 'executed' WHEN v_outcome='already_done' THEN 'already_done' ELSE 'blocked' END,
    blocker=v_blocker, after_snapshot=v_after, updated_at=now(), executed_at=CASE WHEN v_outcome IN ('executed','already_done') THEN now() ELSE null END
  WHERE id=v_ledger;
  RETURN QUERY SELECT v_ledger,v_outcome,v_blocker,v_summary,v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_whatsapp_v3_application_action(text,text,text,text,text,text,jsonb,jsonb,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_whatsapp_v3_application_action(text,text,text,text,text,text,jsonb,jsonb,text) TO service_role;
