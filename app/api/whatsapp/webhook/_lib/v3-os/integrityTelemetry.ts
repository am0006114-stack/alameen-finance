export type IntegrityTelemetryEvent = {
  event: string;
  waId: string;
  turnId: string;
  applicationId?: string | null;
  trackingId?: string | null;
  severity?: "info" | "warning" | "p0";
  details?: Record<string, unknown>;
};

/**
 * Structured server telemetry without a schema migration. It intentionally
 * writes one compact JSON line so production logs can be searched/aggregated,
 * while P0 customer-facing incidents are additionally routed to Discord by the
 * runtime.
 */
export function logIntegrityTelemetry(input: IntegrityTelemetryEvent) {
  const payload = {
    ts: new Date().toISOString(),
    ...input,
  };
  const line = `[V3_CONVERSATION_INTEGRITY] ${JSON.stringify(payload)}`;
  if (input.severity === "p0") console.error(line);
  else if (input.severity === "warning") console.warn(line);
  else console.info(line);
}
