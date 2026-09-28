import type { ConversationState, InterpretedTurn, TruthBundle } from "./types";
import { normalizeArabic } from "./text";

export type SemanticComplexityRoute = "deepseek" | "sol";

export type SemanticComplexityDecision = {
  route: SemanticComplexityRoute;
  score: number;
  reasons: string[];
  fastPathProtected: boolean;
};

const EASY_ACTIONS = new Set([
  "cancel_application",
  "request_refund",
  "stop_refund",
  "reopen_application",
  "link_whatsapp_alias",
  "change_device",
  "change_application_data",
]);

function compact(value: string) {
  return normalizeArabic(String(value || "")).replace(/\s+/g, " ").trim();
}

function recentAssistantFailureEvidence(recentTurns: string[]) {
  const joined = compact(recentTurns.slice(-8).join("\n"));
  return /(?:المعلومه المحدده اللازمه للجواب|مش موجوده عندي ضمن الحقيقه|ما قدرت احدد|اكتب المطلوب نفسه|ما فهمت|بدون ما اخمن)/.test(joined);
}

function repeatedMeaningEvidence(customerText: string, recentTurns: string[]) {
  const current = compact(customerText);
  if (current.length < 14) return false;
  const words = current.split(" ").filter((x) => x.length > 2);
  if (words.length < 3) return false;
  return recentTurns.slice(-8).some((line) => {
    const candidate = compact(line);
    if (!candidate) return false;
    const overlap = words.filter((w) => candidate.includes(w)).length;
    return overlap >= Math.max(3, Math.ceil(words.length * 0.65));
  });
}

function explicitOperationalFastPath(input: {
  customerText: string;
  turn: InterpretedTurn;
}) {
  const n = compact(input.customerText);
  const actions = input.turn.requestedActions.filter((x) => x !== "none");
  if (actions.length === 1 && EASY_ACTIONS.has(actions[0])) return true;

  const paymentTopic = input.turn.topics.some((t) => ["payment_fee", "payment_method", "payment_recipient", "receipt_upload"].includes(t));
  const explicitPayment = /(?:كيف|وين|بدي|اريد|أريد|ابعث|ابعت).{0,45}(?:ادفع|أدفع|دفع|احول|أحول|كليك|cliq|رسوم|خمسه|خمسة|5|٥)/.test(n);
  if (paymentTopic && explicitPayment) return true;

  return false;
}

export function routeSemanticComplexity(input: {
  customerText: string;
  turn: InterpretedTurn;
  state: ConversationState;
  truth: TruthBundle;
  recentTurns?: string[];
}): SemanticComplexityDecision {
  const recentTurns = input.recentTurns || [];
  const n = compact(input.customerText);
  const reasons: string[] = [];
  let score = 0;

  const fastPathProtected = explicitOperationalFastPath({ customerText: input.customerText, turn: input.turn });
  if (fastPathProtected) {
    return { route: "deepseek", score: 0, reasons: ["explicit_operational_fast_path"], fastPathProtected: true };
  }

  if (n.length >= 420) { score += 3; reasons.push("long_customer_story"); }
  else if (n.length >= 240) { score += 2; reasons.push("medium_long_context"); }

  const materialTopics = input.turn.topics.filter((x) => !["unknown", "greeting", "thanks", "acknowledgement"].includes(x));
  if (materialTopics.length >= 3) { score += 3; reasons.push("multi_topic_turn"); }
  else if (materialTopics.length === 2) { score += 1; reasons.push("two_topic_turn"); }

  const actions = Array.from(new Set(input.turn.requestedActions.filter((x) => x !== "none")));
  if (actions.length >= 2) { score += 4; reasons.push("multiple_requested_actions"); }

  if (/(?:غيرت\s+رايي|غيرت\s+رأيي|رجعت\s+غيرت|كنت.{0,80}(?:بس|لكن).{0,80}(?:هسا|الان|الآن)|خلاص.{0,60}(?:لا|بدي))/.test(n)) {
    score += 3; reasons.push("customer_changed_mind");
  }

  const conditionalCount = (n.match(/(?:اذا|إذا|لو|بحال|في\s+حال|بس\s+اذا|بس\s+إذا)/g) || []).length;
  if (conditionalCount >= 2) { score += 3; reasons.push("multi_condition_request"); }
  else if (conditionalCount === 1 && n.length >= 120) { score += 1; reasons.push("conditional_request"); }

  const repairLanguage = /(?:ما\s+فهمت|مش\s+فاهم|مش\s+فاهمه|مو\s+فاهم|مش\s+هيك|جاوبني|انا\s+قاعد|انا\s+بسال|أنا\s+بسأل|ردك|الرد\s+الالي|الرد\s+الآلي)/.test(n);
  if (repairLanguage) { score += 3; reasons.push("customer_repair_signal"); }
  if (repairLanguage && recentAssistantFailureEvidence(recentTurns)) { score += 3; reasons.push("previous_answer_failed_customer"); }

  const humanRequest = input.turn.topics.some((t) => ["human_request", "manager_request", "call_request"].includes(t));
  if (humanRequest && recentAssistantFailureEvidence(recentTurns)) { score += 4; reasons.push("human_request_after_failed_answer"); }

  if (repeatedMeaningEvidence(input.customerText, recentTurns)) { score += 2; reasons.push("repeated_customer_question"); }

  if (input.turn.confidence < 0.45 && materialTopics.length >= 1) { score += 2; reasons.push("low_deterministic_confidence"); }
  if ((input.turn.warnings || []).length >= 3) { score += 2; reasons.push("multiple_semantic_warnings"); }

  const activeStatus = String(input.truth.application?.status || "").toLowerCase();
  const asksCancelButCancelled = actions.includes("cancel_application") && /cancel|لغ/.test(activeStatus);
  const asksReopenButOpen = actions.includes("reopen_application") && activeStatus && !/cancel|لغ/.test(activeStatus);
  if (asksCancelButCancelled || asksReopenButOpen) { score += 2; reasons.push("request_conflicts_with_current_truth"); }

  if (/(?:وبعدين|وبعدها|بعد\s+هيك|بنفس\s+الوقت|كمان|وبرضه|وبرضو)/.test(n) && n.length >= 150) {
    score += 2; reasons.push("multi_step_narrative");
  }

  return {
    route: score >= 5 ? "sol" : "deepseek",
    score,
    reasons: reasons.length ? reasons : ["normal_turn"],
    fastPathProtected: false,
  };
}
