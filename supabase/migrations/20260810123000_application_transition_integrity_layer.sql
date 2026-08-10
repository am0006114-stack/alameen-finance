-- Al Ameen V1.2.0 - Transaction / state integrity layer
-- Long-term invariant: destructive and financial states are auditable and refund states require confirmed-payment evidence.

create table if not exists public.application_action_requests (
  id bigint generated always as identity primary key,
  application_id text not null,
  tracking_id text,
  action_type text not null,
  source text not null default 'whatsapp',
  customer_message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

create unique index if not exists application_action_requests_one_pending_action
  on public.application_action_requests (application_id, action_type)
  where status = 'pending';

create index if not exists application_action_requests_tracking_idx
  on public.application_action_requests (tracking_id, created_at desc);

alter table public.application_action_requests enable row level security;

create table if not exists public.application_state_audit (
  id bigint generated always as identity primary key,
  application_id text not null,
  tracking_id text,
  old_status text,
  new_status text,
  old_payment_status text,
  new_payment_status text,
  old_payment_reference text,
  new_payment_reference text,
  old_payment_confirmed_at timestamptz,
  new_payment_confirmed_at timestamptz,
  changed_at timestamptz not null default now()
);

create index if not exists application_state_audit_application_idx
  on public.application_state_audit (application_id, changed_at desc);

create index if not exists application_state_audit_tracking_idx
  on public.application_state_audit (tracking_id, changed_at desc);

alter table public.application_state_audit enable row level security;

create or replace function public.audit_application_state_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    old.status is distinct from new.status
    or old.payment_status is distinct from new.payment_status
    or old.payment_reference is distinct from new.payment_reference
    or old.payment_confirmed_at is distinct from new.payment_confirmed_at
  then
    insert into public.application_state_audit (
      application_id,
      tracking_id,
      old_status,
      new_status,
      old_payment_status,
      new_payment_status,
      old_payment_reference,
      new_payment_reference,
      old_payment_confirmed_at,
      new_payment_confirmed_at
    ) values (
      new.id::text,
      new.tracking_id,
      old.status,
      new.status,
      old.payment_status,
      new.payment_status,
      old.payment_reference,
      new.payment_reference,
      old.payment_confirmed_at,
      new.payment_confirmed_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_application_state_transition on public.applications;
create trigger trg_audit_application_state_transition
after update on public.applications
for each row
execute function public.audit_application_state_transition();

create or replace function public.guard_refund_requires_confirmed_payment()
returns trigger
language plpgsql
as $$
declare
  entering_or_remaining_refund boolean;
  confirmed_payment_evidence boolean;
begin
  entering_or_remaining_refund :=
    coalesce(new.status, '') in ('refund_requested', 'refund_completed')
    or coalesce(new.payment_status, '') = 'refund_requested';

  confirmed_payment_evidence :=
    new.payment_confirmed_at is not null
    or coalesce(new.payment_status, '') = 'confirmed'
    or coalesce(new.payment_reference, '') = 'customer_cancelled_paid_refund_pending';

  if tg_op = 'UPDATE' then
    confirmed_payment_evidence := confirmed_payment_evidence
      or old.payment_confirmed_at is not null
      or coalesce(old.payment_status, '') = 'confirmed'
      or coalesce(old.payment_reference, '') = 'customer_cancelled_paid_refund_pending';
  end if;

  if entering_or_remaining_refund and not confirmed_payment_evidence then
    raise exception 'REFUND_STATE_REQUIRES_CONFIRMED_PAYMENT_EVIDENCE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refund_requires_confirmed_payment on public.applications;
create trigger trg_refund_requires_confirmed_payment
before insert or update on public.applications
for each row
execute function public.guard_refund_requires_confirmed_payment();
