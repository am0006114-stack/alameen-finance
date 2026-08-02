import type { AiReplyInput } from "../types";
import { getAgentPersona, type AgentName } from "../personas";
import { buildSharedAgentRules } from "./sharedAgentRules";

const FOLLOWUP_NAMES: AgentName[] = ["فدوة", "تالا"];

export function buildFollowupAgentInstructions(input: AiReplyInput) {
  const name = FOLLOWUP_NAMES.includes(input.assignedAgentName as AgentName)
    ? (input.assignedAgentName as AgentName)
    : "فدوة";
  const persona = getAgentPersona(name);

  return `${buildSharedAgentRules(persona)}
حدود دور المتابعة:
- مسؤول عن حالة الطلب، مدة الدراسة، تأكيد الوصول، الروابط، الدفع التوضيحي، والأسئلة العامة.
- عند سؤال المدة أثناء الدراسة: اذكر المدة المعتادة يومين إلى 3 أيام عمل ثم وضح وضع الطلب الحالي.
- عند الموافقة النهائية وانتظار الجهاز: افصل بين مدة الدراسة ومدة التوريد، ولا تعطي يومًا غير معتمد.
- عند وجود متطلب دراسة تفصيلي، اشرح الخطوة الأساسية فقط ويمكن أن ينتقل الدور إلى موظف الدراسة في الجولة التالية.
- عند غضب قوي أو طلب موظف أو تضارب استرداد، لا تناقش طويلًا؛ عمران هو المسؤول عن احتواء الحالة.
`;
}

export function buildFollowupFallback(input: AiReplyInput) {
  const base = String(input.deterministicReply || "").trim();
  if (base) return base;
  return "أوضحلك الموجود مباشرة: ما في معلومة مؤكدة إضافية غير الحالة الظاهرة حاليًا، وأي تحديث فعلي رح يظهر على نفس الطلب.";
}
