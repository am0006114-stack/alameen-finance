-- Al Ameen V1.2.3 - Final Truth Gate & Evidence-Backed Refund Integrity
-- The mutable payment_reference marker is NOT proof that money was received.
-- Refund state requires durable evidence: payment_confirmed_at or a confirmed payment status.

create or replace function public.guard_refund_requires_confirmed_payment()
returns trigger
language plpgsql
as $$
declare
  refund_state boolean;
  confirmed_payment_evidence boolean;
begin
  -- When a previously-confirmed payment is moved into refund state, anchor durable evidence
  -- before payment_status changes away from 'confirmed'.
  if tg_op = 'UPDATE'
     and old.payment_status = 'confirmed'
     and old.payment_confirmed_at is null
     and (
       coalesce(new.status, '') in ('refund_requested', 'refund_completed')
       or coalesce(new.payment_status, '') = 'refund_requested'
     )
  then
    new.payment_confirmed_at := now();
  end if;

  refund_state :=
    coalesce(new.status, '') in ('refund_requested', 'refund_completed')
    or coalesce(new.payment_status, '') = 'refund_requested';

  confirmed_payment_evidence :=
    new.payment_confirmed_at is not null
    or coalesce(new.payment_status, '') = 'confirmed';

  if tg_op = 'UPDATE' then
    confirmed_payment_evidence := confirmed_payment_evidence
      or old.payment_confirmed_at is not null
      or coalesce(old.payment_status, '') = 'confirmed';
  end if;

  if refund_state and not confirmed_payment_evidence then
    raise exception 'REFUND_STATE_REQUIRES_DURABLE_CONFIRMED_PAYMENT_EVIDENCE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refund_requires_confirmed_payment on public.applications;
create trigger trg_refund_requires_confirmed_payment
before insert or update on public.applications
for each row
execute function public.guard_refund_requires_confirmed_payment();
