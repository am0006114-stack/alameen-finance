-- ALAMEEN V2 Phase 2.2 - Risk-first archive sampling.
-- Lab-only function update. Does NOT mutate applications/payments/refunds/cancellations.

CREATE OR REPLACE FUNCTION public.whatsapp_v2_archive_risk_score(p_message text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(p_message,'')) ~ '(الغاء|إلغاء|الغاء الطلب|إلغاء الطلب|استرداد|استرجاع|refund|cancel|دفعت|دفع|رسوم|وصل|كليك|cliq|تحويل)' THEN 100
    WHEN lower(coalesce(p_message,'')) ~ '(نصب|نصاب|احتيال|شكوى|اشتك|قانون|محامي|تشهير)' THEN 98
    WHEN lower(coalesce(p_message,'')) ~ '(كفيل|ضامن|كشف راتب|شهادة راتب|هويه|هوية|مستند|وثيقه|وثيقة)' THEN 95
    WHEN lower(coalesce(p_message,'')) ~ '(موافق|موافقة|الموافقه|رفض|مرفوض|حالة الطلب|شو صار|وين وصل|قيد المراجعه|قيد المراجعة|دراسه|دراسة)' THEN 92
    WHEN lower(coalesce(p_message,'')) ~ '(موظف|موضف|احكي مع حدا|بدي حدا|مسؤول)' THEN 90
    WHEN lower(coalesce(p_message,'')) ~ '(كيف هيك|كيف يعني|ليش|ماعندي|ما عندي|مش فاهم|ما فهمت|وضح|الرسوم\*|\*)' THEN 88
    WHEN lower(coalesce(p_message,'')) ~ '(القسط|الاقساط|الأقساط|دفعة اولى|الدفعة الاولى|الدفعة الأولى|كم شهر|اشهر|أشهر|موعد|استلام|موقع|وين موقع|تلفون|جهاز|ايفون|سامسونج)' THEN 82
    WHEN length(coalesce(p_message,'')) >= 45 AND (coalesce(p_message,'') LIKE '%؟%' OR coalesce(p_message,'') LIKE '%?%') THEN 78
    WHEN lower(trim(coalesce(p_message,''))) ~ '^(مرحبا|هلا|اهلا|أهلا|السلام عليكم|شكرا|شكراً)$' THEN 5
    ELSE 40
  END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_v2_archive_risk_score(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_v2_archive_risk_score(text) TO service_role;

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
    ORDER BY public.whatsapp_v2_archive_risk_score(customer_message) DESC, source_created_at ASC
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
