-- ALAMEEN V3 Phase 7.6.0 — Application WhatsApp Contact Identity
-- Customer-confirmed WhatsApp aliases per application without mutating applications.phone.
-- Two-step flow: tracking/safe preview -> explicit prompt -> explicit named confirmation -> approved alias.
-- Safe to re-run. No triggers. Service-role runtime writes only.

DO $$
BEGIN
  IF to_regclass('public.applications') IS NULL THEN
    RAISE EXCEPTION 'WRONG_DATABASE: public.applications is missing';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_application_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  tracking_id text,
  application_phone text,
  wa_id text NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','rejected')),
  requested_by_wa_id text NOT NULL,
  request_text text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  approved_by text,
  confirmation_turn_id text,
  confirmation_text text,
  approval_source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_application_contacts_app_wa_key UNIQUE (application_id, wa_id)
);

-- Idempotent compatibility when the table exists from a pre-release candidate.
ALTER TABLE public.whatsapp_application_contacts
  ADD COLUMN IF NOT EXISTS confirmation_turn_id text,
  ADD COLUMN IF NOT EXISTS confirmation_text text,
  ADD COLUMN IF NOT EXISTS approval_source text;

ALTER TABLE public.whatsapp_application_contacts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS whatsapp_application_contacts_wa_status_idx
  ON public.whatsapp_application_contacts(wa_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_application_contacts_app_status_idx
  ON public.whatsapp_application_contacts(application_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_application_contacts_tracking_idx
  ON public.whatsapp_application_contacts(tracking_id, updated_at DESC);
