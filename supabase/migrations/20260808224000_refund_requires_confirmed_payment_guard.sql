-- Al Ameen V1.1.9.1
-- Hard database guard: an application may not ENTER a refund state unless payment was previously confirmed.

create or replace function public.guard_refund_requires_confirmed_payment()
returns trigger
language plpgsql
as $$
begin
  if (
    (new.status = 'refund_requested' or new.payment_status = 'refund_requested')
    and not (old.status = 'refund_requested' or old.payment_status = 'refund_requested')
    and not (old.payment_status = 'confirmed' or old.payment_confirmed_at is not null)
  ) then
    raise exception 'REFUND_REQUIRES_CONFIRMED_PAYMENT';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refund_requires_confirmed_payment on public.applications;

create trigger trg_refund_requires_confirmed_payment
before update on public.applications
for each row
execute function public.guard_refund_requires_confirmed_payment();
