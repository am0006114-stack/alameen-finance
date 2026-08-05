-- V1.1.5 — Mandatory device selection guard
-- Prevent every new application from being inserted without a complete device selection.

create or replace function public.enforce_new_application_device_selection()
returns trigger
language plpgsql
as $$
begin
  if new.device_id is null or btrim(new.device_id::text) = '' then
    raise exception 'DEVICE_SELECTION_REQUIRED: device_id is required';
  end if;

  if new.device_name is null or btrim(new.device_name::text) = '' then
    raise exception 'DEVICE_SELECTION_REQUIRED: device_name is required';
  end if;

  if new.device_price is null or new.device_price <= 0 then
    raise exception 'DEVICE_SELECTION_REQUIRED: device_price must be positive';
  end if;

  if new.installment_months is null or new.installment_months not in (12, 24, 36) then
    raise exception 'DEVICE_SELECTION_REQUIRED: installment_months must be 12, 24, or 36';
  end if;

  if new.monthly_payment is null or new.monthly_payment <= 0 then
    raise exception 'DEVICE_SELECTION_REQUIRED: monthly_payment must be positive';
  end if;

  if new.total_with_interest is null or new.total_with_interest <= 0 then
    raise exception 'DEVICE_SELECTION_REQUIRED: total_with_interest must be positive';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_require_device_on_insert on public.applications;
create trigger applications_require_device_on_insert
before insert on public.applications
for each row
execute function public.enforce_new_application_device_selection();
