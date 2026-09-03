export type V3NotificationEvent =
  | "customer_continue_payment_ready"
  | "official_receipt_uploaded"
  | "official_salary_slip_uploaded"
  | "payment_confirmation_required"
  | "manual_action_required"
  | "business_mutation_succeeded"
  | "business_mutation_failed"
  | "truth_integrity_failure"
  | "final_safety_fail_closed"
  | "whatsapp_delivery_failure"
  | "v3_circuit_breaker_tripped"
  | "provider_interpreter_recovered"
  | "provider_writer_recovered"
  | "verifier_repaired"
  | "routine_customer_complaint"
  | "routine_unknown_message"
  | "routine_action_success"
  | "archive_lab_failure";

export type V3NotificationDecision = {
  notify: boolean;
  severity: "none" | "info" | "important" | "critical";
  mentionAdmin: boolean;
  dedupeKey: string | null;
  reason: string;
};

const QUIET_EVENTS = new Set<V3NotificationEvent>([
  "provider_interpreter_recovered",
  "provider_writer_recovered",
  "verifier_repaired",
  "routine_customer_complaint",
  "routine_unknown_message",
  "routine_action_success",
  "final_safety_fail_closed",
]);

export function decideV3DiscordNotification(input: {
  event: V3NotificationEvent;
  applicationId?: string | null;
  paymentConfirmed?: boolean;
  recovered?: boolean;
  actionKey?: string | null;
}): V3NotificationDecision {
  if (QUIET_EVENTS.has(input.event)) {
    return { notify: false, severity: "none", mentionAdmin: false, dedupeKey: null, reason: "routine_or_self_recovered_event_is_telemetry_only" };
  }

  if (input.event === "customer_continue_payment_ready") {
    return {
      notify: true,
      severity: "important",
      mentionAdmin: false,
      dedupeKey: `customer-continue:${input.applicationId || "unknown"}`,
      reason: "customer_explicitly_chose_to_continue_and_payment_step_is_ready",
    };
  }

  if (input.event === "manual_action_required") {
    return {
      notify: true,
      severity: "important",
      mentionAdmin: true,
      dedupeKey: `manual-action:${input.applicationId || "unknown"}:${input.actionKey || "unknown"}`,
      reason: "real_action_requires_manual_admin_execution",
    };
  }

  if (input.event === "business_mutation_succeeded") {
    return {
      notify: true,
      severity: "important",
      mentionAdmin: false,
      dedupeKey: `mutation-succeeded:${input.applicationId || "unknown"}:${input.actionKey || "unknown"}`,
      reason: "scoped_real_action_executed_successfully",
    };
  }

  if (input.event === "official_salary_slip_uploaded") {
    return {
      notify: true,
      severity: "important",
      mentionAdmin: false,
      dedupeKey: `salary-slip-uploaded:${input.applicationId || "unknown"}`,
      reason: "official_salary_slip_uploaded",
    };
  }

  if (input.event === "official_receipt_uploaded" || input.event === "payment_confirmation_required") {
    if (input.paymentConfirmed) return { notify: false, severity: "none", mentionAdmin: false, dedupeKey: null, reason: "payment_already_confirmed" };
    return {
      notify: true,
      severity: "important",
      mentionAdmin: true,
      dedupeKey: `payment-confirmation:${input.applicationId || "unknown"}`,
      reason: "manual_admin_payment_confirmation_is_required",
    };
  }

  if (input.event === "business_mutation_failed") {
    return {
      notify: true,
      severity: "critical",
      mentionAdmin: true,
      dedupeKey: `mutation-failed:${input.applicationId || "unknown"}`,
      reason: "customer_requested_real_change_but_database_mutation_failed",
    };
  }

  if (input.event === "truth_integrity_failure") {
    return {
      notify: true,
      severity: "critical",
      mentionAdmin: true,
      dedupeKey: `truth-integrity:${input.applicationId || "unknown"}`,
      reason: "truth_or_send_safety_could_not_self_recover",
    };
  }

  if (input.event === "whatsapp_delivery_failure") {
    return {
      notify: true,
      severity: "critical",
      mentionAdmin: true,
      dedupeKey: "whatsapp-delivery-failure-global",
      reason: "whatsapp_delivery_failed_after_safe_retry",
    };
  }

  if (input.event === "v3_circuit_breaker_tripped") {
    return {
      notify: true,
      severity: "critical",
      mentionAdmin: true,
      dedupeKey: "v3-circuit-breaker-global",
      reason: "v3_was_automatically_stopped_to_protect_customers",
    };
  }

  if (input.event === "archive_lab_failure") {
    return { notify: false, severity: "info", mentionAdmin: false, dedupeKey: null, reason: "archive_lab_errors_stay_in_lab_telemetry_not_customer_discord" };
  }

  return { notify: false, severity: "none", mentionAdmin: false, dedupeKey: null, reason: "no_notification_needed" };
}
