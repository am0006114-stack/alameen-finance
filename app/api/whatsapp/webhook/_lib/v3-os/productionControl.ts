import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { V3_OS_VERSION } from "./types";

export type V3ProductionControl = {
  liveEnabled: boolean;
  killSwitch: boolean;
  realActionsEnabled: boolean;
  resumeLegacyIgnored: boolean;
  runtimeVersion: string;
  source: "db" | "safe_default";
};

const SAFE_DEFAULT: V3ProductionControl = {
  liveEnabled: false,
  killSwitch: false,
  realActionsEnabled: false,
  resumeLegacyIgnored: true,
  runtimeVersion: V3_OS_VERSION,
  source: "safe_default",
};

export async function getV3ProductionControl(): Promise<V3ProductionControl> {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_v3_production_settings")
      .select("live_enabled,kill_switch,real_actions_enabled,resume_legacy_ignored,runtime_version")
      .eq("id", "default")
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("v3 production control read failed:", error.message);
      return SAFE_DEFAULT;
    }

    return {
      liveEnabled: data.live_enabled === true,
      killSwitch: data.kill_switch === true,
      realActionsEnabled: data.real_actions_enabled === true,
      resumeLegacyIgnored: data.resume_legacy_ignored !== false,
      runtimeVersion: String(data.runtime_version || V3_OS_VERSION),
      source: "db",
    };
  } catch (error) {
    console.error("v3 production control failed:", error);
    return SAFE_DEFAULT;
  }
}

export function isV3ProductionActive(control: V3ProductionControl) {
  return control.liveEnabled && !control.killSwitch;
}

export function canV3ExecuteRealActions(control: V3ProductionControl) {
  return isV3ProductionActive(control) && control.realActionsEnabled;
}


export async function tripV3ProductionCircuitBreaker(reason: string) {
  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_v3_production_settings")
      .update({
        live_enabled: false,
        kill_switch: true,
        real_actions_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");

    if (error) {
      console.error("v3 circuit breaker update failed:", { reason, error: error.message });
      return false;
    }

    console.error("v3 circuit breaker tripped:", { reason });
    return true;
  } catch (error) {
    console.error("v3 circuit breaker exception:", { reason, error });
    return false;
  }
}
