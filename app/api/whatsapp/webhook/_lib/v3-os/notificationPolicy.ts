export type V3NotificationEvent =
  | "official_receipt_uploaded"
  | "payment_confirmation_required"
  | "business_mutation_failed"
  | "truth_integrity_failure"
  | "final_safety_fail_closed"
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
]);

export function decideV3DiscordNotification(input: {
  event: V3NotificationEvent;
  applicationId?: string | null;
  paymentConfirmed?: boolean;
  recovered?: boolean;
}): V3NotificationDecision {
  if (QUIET_EVENTS.has(input.event)) {
    return { notify: false, severity: "none", mentionAdmin: false, dedupeKey: null, reason: "routine_or_self_recovered_event_is_telemetry_only" };
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

  if (input.event === "truth_integrity_failure" || input.event === "final_safety_fail_closed") {
    return {
      notify: true,
      severity: "critical",
      mentionAdmin: true,
      dedupeKey: `${input.event}:${input.applicationId || "unknown"}`,
      reason: "truth_or_send_safety_could_not_self_recover",
    };
  }

  if (input.event === "archive_lab_failure") {
    return { notify: false, severity: "info", mentionAdmin: false, dedupeKey: null, reason: "archive_lab_errors_stay_in_lab_telemetry_not_customer_discord" };
  }

  return { notify: false, severity: "none", mentionAdmin: false, dedupeKey: null, reason: "no_notification_needed" };
}
