-- Applied to Production on 2026-11-02.
-- Explicit deny-all client policies. Server service_role access is unchanged.

create policy "customer_postpayment_channel_state_deny_client_all"
  on public.customer_postpayment_channel_state
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "web_chat_sessions_deny_client_all"
  on public.web_chat_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "web_chat_messages_deny_client_all"
  on public.web_chat_messages
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "web_chat_settings_deny_client_all"
  on public.web_chat_settings
  for all
  to anon, authenticated
  using (false)
  with check (false);
