-- V1.4.0 - WhatsApp application identity lock.
-- Keeps a conversation tied to the explicitly selected application so a later short
-- follow-up cannot silently jump to a different application on the same phone number.
-- Safety: fail loudly if this is accidentally executed in the wrong Supabase project.

do $$
begin
  if to_regclass('public.applications') is null then
    raise exception 'ALAMEEN_V1_4_0_WRONG_DATABASE_APPLICATIONS_TABLE_MISSING';
  end if;
end
$$;

create table if not exists public.whatsapp_application_locks (
  wa_id text primary key,
  application_id text not null,
  tracking_id text null,
  customer_name text null,
  source text not null default 'conversation',
  locked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_application_locks_application_id_idx
  on public.whatsapp_application_locks (application_id);

create index if not exists whatsapp_application_locks_tracking_id_idx
  on public.whatsapp_application_locks (tracking_id);

comment on table public.whatsapp_application_locks is
  'Conversation-level application identity lock used by the WhatsApp engine. Explicit tracking/name selection overrides the prior lock.';
