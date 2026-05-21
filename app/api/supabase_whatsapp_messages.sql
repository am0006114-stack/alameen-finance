create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wa_id text,
  direction text not null check (direction in ('incoming', 'outgoing')),
  customer_name text,
  message_id text,
  message_type text,
  body text,
  handled_by text default 'system'
);

create index if not exists whatsapp_messages_wa_id_created_at_idx
on public.whatsapp_messages (wa_id, created_at desc);

create index if not exists whatsapp_messages_created_at_idx
on public.whatsapp_messages (created_at desc);
