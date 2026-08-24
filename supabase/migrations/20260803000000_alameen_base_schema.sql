-- Al-Ameen base schema bootstrap reconstructed from the live production schema on 2026-08-24.
-- Purpose: restore the pre-2026-08-03 foundation missing from the repository migration chain.
-- This migration intentionally excludes objects introduced by migrations dated 2026-08-03 and later.
-- It also leaves public-schema ownership/CREATE permissions at the fresh Supabase project defaults,
-- while preserving production default privileges for tables/functions/sequences created by later migrations.

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Preserve production default privileges without changing public-schema ownership/CREATE rights.
alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "anon";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "authenticated";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "service_role";

alter default privileges for role "postgres" in schema "public" revoke all on FUNCTIONS from public;

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "anon";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "authenticated";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "service_role";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "anon";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "authenticated";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "service_role";


-- Source: live production declarative schema / public/tables/ai_conversations.sql
create table "public"."ai_conversations" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "phone"              text,
  "customer_message"   text,
  "ai_reply"           text,
  "intent"             text,
  "application_status" text,
  "customer_replied"   boolean                  default false,
  "created_at"         timestamp with time zone default now(),
  constraint "ai_conversations_pkey" primary key (id)
);

alter table "public"."ai_conversations"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ai_conversations" to "anon", "authenticated", "postgres", "service_role";


-- Source: live production declarative schema / public/tables/ai_successful_replies.sql
create table "public"."ai_successful_replies" (
  "id"               uuid                     not null default gen_random_uuid(),
  "intent"           text,
  "customer_message" text,
  "ai_reply"         text,
  "score"            integer                  default 0,
  "created_at"       timestamp with time zone default now(),
  constraint "ai_successful_replies_pkey" primary key (id)
);

alter table "public"."ai_successful_replies"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ai_successful_replies" to "anon", "authenticated", "postgres", "service_role";


-- Source: live production declarative schema / public/tables/applications.sql
create table "public"."applications" (
  "id"                           uuid                        not null default extensions.uuid_generate_v4(),
  "tracking_id"                  text,
  "full_name"                    text,
  "national_id"                  text,
  "phone"                        text,
  "email"                        text,
  "employer"                     text,
  "salary"                       integer,
  "social_security"              boolean,
  "guarantor_name"               text,
  "guarantor_phone"              text,
  "status"                       text                        default 'pending_payment'::text,
  "payment_status"               text                        default 'pending'::text,
  "payment_reference"            text,
  "created_at"                   timestamp without time zone default now(),
  "updated_at"                   timestamp without time zone default now(),
  "governorate"                  text,
  "city_area"                    text,
  "detailed_address"             text,
  "nearest_landmark"             text,
  "financial_clear"              boolean                     default false,
  "payment_deadline"             timestamp without time zone,
  "terms_accepted"               boolean                     default false,
  "applicant_social_security"    boolean                     default false,
  "guarantor_social_security"    boolean                     default false,
  "guarantor_relationship"       text,
  "eligibility_path"             text,
  "guarantor_national_id"        text,
  "paid_clicked_at"              timestamp with time zone,
  "device_id"                    text,
  "device_name"                  text,
  "device_price"                 numeric,
  "installment_months"           integer,
  "down_payment"                 numeric                     default 0,
  "interest_rate"                numeric,
  "monthly_payment"              numeric,
  "total_with_interest"          numeric,
  "location_latitude"            double precision,
  "location_longitude"           double precision,
  "location_accuracy"            double precision,
  "location_captured_at"         timestamp with time zone,
  "payment_confirmed_at"         timestamp with time zone,
  "delivery_delay_started_at"    timestamp with time zone,
  "delivery_delay_until"         timestamp with time zone,
  "delivery_delay_link_sent_at"  timestamp with time zone,
  "delivery_delay_last_notice"   text,
  "delivery_delay_response_at"   timestamp with time zone,
  "preliminary_qualified_at"     timestamp with time zone,
  "preliminary_whatsapp_sent_at" timestamp with time zone,
  "preliminary_whatsapp_status"  text,
  "preliminary_whatsapp_error"   text,
  constraint "applications_pkey" primary key (id),
  constraint "applications_tracking_id_key" unique (tracking_id),
  constraint "national_id_format_check" check ((national_id ~ '^[92][0-9]{9}$'::text)),
  constraint "phone_format_check" check ((phone ~ '^(079|078|077)[0-9]{7}$'::text))
);

alter table "public"."applications"
  enable row level security;

create index applications_delivery_delay_until_idx on public.applications using btree (delivery_delay_until);

create index applications_payment_status_idx on public.applications using btree (payment_status);

create index applications_status_idx on public.applications using btree (status);




create policy "Allow public insert applications" on "public"."applications"
  for insert
  to "anon"
  with check (true);

create policy "Allow public select applications" on "public"."applications"
  for select
  to "anon"
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."applications" to "anon", "authenticated", "postgres", "service_role";


-- Source: live production declarative schema / public/tables/documents.sql
create table "public"."documents" (
  "id"             uuid                        not null default extensions.uuid_generate_v4(),
  "application_id" uuid,
  "type"           text,
  "file_url"       text,
  "created_at"     timestamp without time zone default now(),
  constraint "documents_application_id_fkey" foreign key (application_id) references public.applications(id),
  constraint "documents_pkey" primary key (id)
);

alter table "public"."documents"
  enable row level security;

create policy "Allow public insert documents" on "public"."documents"
  for insert
  to "anon"
  with check (true);

create policy "Allow public select documents" on "public"."documents"
  for select
  to "anon"
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."documents" to "anon", "authenticated", "postgres", "service_role";


-- Source: live production declarative schema / public/tables/whatsapp_incoming_message_dedupe.sql
create table "public"."whatsapp_incoming_message_dedupe" (
  "id"           uuid                     not null default gen_random_uuid(),
  "message_id"   text                     not null,
  "wa_id"        text,
  "body"         text,
  "message_type" text,
  "received_at"  timestamp with time zone not null default now(),
  "processed_at" timestamp with time zone,
  "raw_payload"  jsonb,
  constraint "whatsapp_incoming_message_dedupe_message_id_key" unique (message_id),
  constraint "whatsapp_incoming_message_dedupe_pkey" primary key (id)
);

alter table "public"."whatsapp_incoming_message_dedupe"
  enable row level security;

create unique index whatsapp_incoming_message_dedupe_message_id_idx on public.whatsapp_incoming_message_dedupe using btree (message_id);

create index whatsapp_incoming_message_dedupe_received_at_idx on public.whatsapp_incoming_message_dedupe using btree (received_at desc);

create index whatsapp_incoming_message_dedupe_wa_id_idx on public.whatsapp_incoming_message_dedupe using btree (wa_id);

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."whatsapp_incoming_message_dedupe"
  to "anon", "authenticated", "postgres", "service_role";


-- Source: live production declarative schema / public/tables/whatsapp_messages.sql
create table "public"."whatsapp_messages" (
  "id"                 uuid                     not null default gen_random_uuid(),
  "created_at"         timestamp with time zone not null default now(),
  "wa_id"              text,
  "direction"          text                     not null,
  "customer_name"      text,
  "message_id"         text,
  "message_type"       text,
  "body"               text,
  "handled_by"         text                     default 'system'::text,
  "status"             text,
  "raw_payload"        jsonb,
  "status_timestamp"   timestamp with time zone,
  "intent"             text,
  "tracking_id"        text,
  "application_id"     uuid,
  "needs_human_review" boolean                  not null default false,
  "handled_by_ai"      boolean,
  "ai_confidence"      numeric,
  "admin_note"         text,
  constraint "whatsapp_messages_direction_check" check ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text]))),
  constraint "whatsapp_messages_pkey" primary key (id)
);

alter table "public"."whatsapp_messages"
  enable row level security;

create index whatsapp_messages_application_id_idx on public.whatsapp_messages using btree (application_id);

create index whatsapp_messages_created_at_idx on public.whatsapp_messages using btree (created_at desc);

create index whatsapp_messages_direction_idx on public.whatsapp_messages using btree (direction);

create index whatsapp_messages_intent_idx on public.whatsapp_messages using btree (intent);

create index whatsapp_messages_message_id_idx on public.whatsapp_messages using btree (message_id);

create index whatsapp_messages_needs_human_review_idx on public.whatsapp_messages using btree (needs_human_review, created_at desc);

create index whatsapp_messages_status_idx on public.whatsapp_messages using btree (status);

create index whatsapp_messages_status_timestamp_idx on public.whatsapp_messages using btree (status_timestamp desc);

create index whatsapp_messages_tracking_id_idx on public.whatsapp_messages using btree (tracking_id);

create index whatsapp_messages_wa_id_created_at_idx on public.whatsapp_messages using btree (wa_id, created_at desc);

create index whatsapp_messages_wa_id_idx on public.whatsapp_messages using btree (wa_id);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."whatsapp_messages" to "anon", "authenticated", "postgres", "service_role";


-- Source: live production declarative schema / public/tables/whatsapp_outgoing_reply_locks.sql
create table "public"."whatsapp_outgoing_reply_locks" (
  "lock_key"            text                     not null,
  "wa_id"               text                     not null,
  "incoming_message_id" text,
  "reply_body"          text,
  "created_at"          timestamp with time zone default now(),
  constraint "whatsapp_outgoing_reply_locks_pkey" primary key (lock_key)
);

alter table "public"."whatsapp_outgoing_reply_locks"
  enable row level security;

create index whatsapp_outgoing_reply_locks_created_at_idx on public.whatsapp_outgoing_reply_locks using btree (created_at desc);

create index whatsapp_outgoing_reply_locks_wa_id_idx on public.whatsapp_outgoing_reply_locks using btree (wa_id);

grant delete, insert, maintain, references, select, trigger, truncate, update
  on table "public"."whatsapp_outgoing_reply_locks"
  to "anon", "authenticated", "postgres", "service_role";
