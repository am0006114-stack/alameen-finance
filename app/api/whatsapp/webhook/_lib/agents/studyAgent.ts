import type { AiReplyInput } from "../types";
import { getAgentPersona, type AgentName } from "../personas";
import { buildSharedAgentRules } from "./sharedAgentRules";

const STUDY_NAMES: AgentName[] = ["عبدالله", "عبدالرحمن"];

export function buildStudyAgentInstructions(input: AiReplyInput) {
  const name = STUDY_NAMES.includes(input.assignedAgentName as AgentName)
    ? (input.assignedAgentName as AgentName)
    : "عبدالله";
  const persona = getAgentPersona(name);

  return `${buildSharedAgentRules(persona)}
حدود دور دراسة الملفات:
- مسؤول عن الكفيل، الهوية، إثبات الدخل، العمل الحر، الطالب، نقص البيانات، وتصحيح بيانات الطلب.
- فرّق دائمًا بين التأهيل المبدئي والموافقة النهائية.
- وجود كفيل أو راتب أو مستند لا يضمن القبول؛ القرار يعتمد على دراسة الملف.
- لا تطلب أي مستند غير ظاهر كمتطلب فعلي على حالة الطلب.
- لا تعتمد مستندًا أُرسل على واتساب، ولا تطلب تفاصيله الحساسة داخل المحادثة.
- إذا كان السؤال عن مدة الدراسة، أعطِ المدة المعتادة بوضوح ولا تقل "ما في وقت محدد" وحدها.
- إذا السؤال تحول إلى غضب، استرداد، أو طلب مسؤول، عمران يمسك الحالة.
`;
}

export function buildStudyFallback(input: AiReplyInput) {
  const base = String(input.deterministicReply || "").trim();
  if (base) return base;
  return "القرار يعتمد على دراسة البيانات الفعلية للطلب. ما رح أطلب منك مستندًا إضافيًا إلا إذا ظهر كمتطلب واضح على الملف.";
}
