import { deviceChangeLinkFailureReported } from "./applicationModificationRouting";
import { hasAuthoritativePaymentConfirmation } from "./paymentTruth";
import type { ConversationState, TruthBundle } from "./types";

const DEVICE_CHANGE_RECOVERY_FACT = "device_change_link_failure_recovery";

type RecoveryMarker = {
  applicationKey: string;
  deviceSignature: string;
  startedAt: string;
};

function applicationKey(application: any) {
  return String(application?.id || application?.trackingId || "").trim();
}

function deviceSignature(application: any) {
  return [
    String(application?.deviceId || "").trim(),
    String(application?.deviceName || "").trim(),
    String(application?.deviceModel || "").trim(),
    String(application?.storage || application?.capacity || "").trim(),
    String(application?.color || "").trim(),
  ].join("|");
}

function parseMarker(value: string | null | undefined): RecoveryMarker | null {
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!parsed || typeof parsed !== "object") return null;
    const applicationKeyValue = String((parsed as any).applicationKey || "").trim();
    const signature = String((parsed as any).deviceSignature || "");
    if (!applicationKeyValue) return null;
    return {
      applicationKey: applicationKeyValue,
      deviceSignature: signature,
      startedAt: String((parsed as any).startedAt || ""),
    };
  } catch {
    return null;
  }
}

function markerForState(state: ConversationState) {
  const fact = (state.facts || []).find((item) => item.key === DEVICE_CHANGE_RECOVERY_FACT);
  return fact ? parseMarker(fact.value) : null;
}

export function deviceChangeRecoveryIsActive(input: { state: ConversationState; truth: TruthBundle }) {
  const app: any = input.truth.application;
  const marker = markerForState(input.state);
  if (!app || !marker) return false;
  return marker.applicationKey === applicationKey(app)
    && marker.deviceSignature === deviceSignature(app);
}

export function applyDeviceChangeRecoveryState(input: {
  state: ConversationState;
  truth: TruthBundle;
  customerText: string;
}) {
  const app: any = input.truth.application;
  const stamp = new Date().toISOString();
  const oldMarker = markerForState(input.state);
  const currentKey = applicationKey(app);
  const currentSignature = deviceSignature(app);
  const oldMarkerStillMatches = Boolean(
    app && oldMarker
    && oldMarker.applicationKey === currentKey
    && oldMarker.deviceSignature === currentSignature
  );

  const failureNow = Boolean(
    app
    && hasAuthoritativePaymentConfirmation(app)
    && deviceChangeLinkFailureReported({
      customerText: input.customerText,
      lastAssistantText: input.state.lastAssistantText,
    })
  );

  const facts = (input.state.facts || []).filter((fact) => fact.key !== DEVICE_CHANGE_RECOVERY_FACT);
  if (oldMarkerStillMatches || failureNow) {
    const marker: RecoveryMarker = oldMarkerStillMatches && oldMarker
      ? oldMarker
      : { applicationKey: currentKey, deviceSignature: currentSignature, startedAt: stamp };
    facts.push({
      key: DEVICE_CHANGE_RECOVERY_FACT,
      value: JSON.stringify(marker),
      topic: "device_change",
      source: "system",
      confidence: 1,
      turnId: input.state.lastTurnId || "device-change-recovery",
      updatedAt: stamp,
    });
  }

  const state = {
    ...input.state,
    facts,
    updatedAt: stamp,
  };

  return {
    state,
    active: Boolean(oldMarkerStillMatches || failureNow),
    started: Boolean(failureNow && !oldMarkerStillMatches),
  };
}
