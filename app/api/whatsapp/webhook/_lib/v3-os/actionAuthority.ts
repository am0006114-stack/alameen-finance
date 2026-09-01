import { actionRequiresOmran } from "./hierarchy";
import type { DialogueAct, InterpretedTurn } from "./types";

/**
 * Mutation authorization is intentionally separated from semantic understanding.
 * The model may help understand language, but it cannot unilaterally authorize a
 * business-state mutation. Direct deterministic/resolved customer instructions
 * execute automatically; model-only mutation interpretations require one narrow
 * confirmation and are then resolved from the conversation state.
 */
export function mutationAuthorization(turn: InterpretedTurn, act: DialogueAct): "authorized" | "confirmation_required" {
  if (!act.action || act.action === "none" || !actionRequiresOmran(act.action)) return "authorized";
  if (act.source === "deterministic" || act.source === "resolved") return "authorized";
  const deterministicSameAction = turn.acts.some(other =>
    other !== act &&
    other.source === "deterministic" &&
    other.type === "request_action" &&
    other.action === act.action
  );
  return deterministicSameAction ? "authorized" : "confirmation_required";
}
