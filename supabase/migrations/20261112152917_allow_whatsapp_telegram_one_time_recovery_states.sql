-- Production migration 20261112152917 was applied successfully on 2026-11-12.
-- Extend the existing state constraint for the two atomic, one-time
-- recovery states already emitted by telegramMigration.ts.
-- This migration DOES NOT update application data or payment/refund state.
DO $$
DECLARE current_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO current_definition
  FROM pg_constraint AS c
  WHERE c.conrelid = 'public.whatsapp_telegram_migration_state'::regclass
    AND c.conname = 'whatsapp_telegram_migration_state_state_check';
  IF current_definition IS DISTINCT FROM
     'CHECK ((state = ANY (ARRAY[''eligible''::text, ''handoff_sent''::text, ''linked''::text, ''exhausted''::text])))' THEN
    RAISE EXCEPTION 'whatsapp telegram state constraint unexpectedly changed; aborting safe migration';
  END IF;
END
$$;

ALTER TABLE public.whatsapp_telegram_migration_state
  ADD CONSTRAINT whatsapp_telegram_migration_state_state_check_expanded
  CHECK (state IN ('eligible','handoff_sent','linked','exhausted','recovery_reserved','recovery_exhausted'))
  NOT VALID;

ALTER TABLE public.whatsapp_telegram_migration_state
  DROP CONSTRAINT whatsapp_telegram_migration_state_state_check;

ALTER TABLE public.whatsapp_telegram_migration_state
  VALIDATE CONSTRAINT whatsapp_telegram_migration_state_state_check_expanded;

ALTER TABLE public.whatsapp_telegram_migration_state
  RENAME CONSTRAINT whatsapp_telegram_migration_state_state_check_expanded
  TO whatsapp_telegram_migration_state_state_check;
