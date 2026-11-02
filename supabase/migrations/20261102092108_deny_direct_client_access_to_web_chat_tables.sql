-- Applied to Production on 2026-11-02.
-- Explicit deny-all client policies. Server service_role access is unchanged.

create policy "deny_anon_authenticated_customer_channel_state"
  on public.customer_postpayment_channel_state
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_anon_authenticated_web_chat_sessions"
  on public.web_chat_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_anon_authenticated_web_chat_messages"
  on public.web_chat_messages
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny_anon_authenticated_web_chat_settings"
  on public.web_chat_settings
  for all
  to anon, authenticated
  using (false)
  with check (false);
