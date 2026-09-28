import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type HumanOsControl = {
  enabled: boolean;
  solEnabled: boolean;
  maxRecentTurns: number;
  maxPromptChars: number;
  source: "db" | "safe_default";
};

const SAFE_DEFAULT: HumanOsControl = {
  enabled: false,
  solEnabled: false,
  maxRecentTurns: 6,
  maxPromptChars: 18000,
  source: "safe_default",
};

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

export async function getHumanOsControl(): Promise<HumanOsControl> {
  try {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_human_os_settings")
      .select("enabled,sol_enabled,max_recent_turns,max_prompt_chars")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return SAFE_DEFAULT;
    return {
      enabled: data.enabled === true,
      solEnabled: data.sol_enabled === true,
      maxRecentTurns: boundedInt(data.max_recent_turns, 6, 2, 10),
      maxPromptChars: boundedInt(data.max_prompt_chars, 18000, 8000, 30000),
      source: "db",
    };
  } catch {
    return SAFE_DEFAULT;
  }
}
