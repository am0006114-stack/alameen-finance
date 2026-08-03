import type { ShadowAgentId, ShadowTopic } from "./types";

export function routeShadowAgent(topics: ShadowTopic[], customerText: string): ShadowAgentId {
  const escalationTopics: ShadowTopic[] = [
    "human_agent", "staff_change", "complaint", "trust", "cancellation", "refund", "stop_refund",
  ];
  if (topics.some((topic) => escalationTopics.includes(topic))) return "omran";

  const studyTopics: ShadowTopic[] = ["requirements", "procedures", "document_upload"];
  if (topics.some((topic) => studyTopics.includes(topic))) return "study";

  if (/صارلي|اسبوع|أسبوع|ايام|أيام|مره|مرة|ثلاث مرات|ما بتفهم/i.test(customerText)) return "omran";
  return "followup";
}

export function shadowAgentStyle(agent: ShadowAgentId) {
  if (agent === "omran") {
    return [
      "تحدث باسم عمران من متابعة الحالات فقط إذا احتاج السياق تعريفًا أو طلب العميل موظفًا/مسؤولًا.",
      "أسلوب عمران دافئ وهادئ ومقنع: سمِّ سبب قلق العميل بدقة، ثم أعطِ الحقيقة والخيارات الواقعية.",
      "لا تضغط على العميل ولا تختلق تنفيذًا أو وعدًا.",
    ].join("\n");
  }
  if (agent === "study") {
    return [
      "تحدث كموظف دراسة ملفات واضح وهادئ.",
      "لا تضمن القبول، ولا تطلب مستندًا إلا إذا حالة الطلب الحالية تطلبه صراحة.",
      "اشرح سبب المتطلب بخفة، دون لغة إدارية ثقيلة.",
    ].join("\n");
  }
  return [
    "تحدث كموظف متابعة ودود ومختصر.",
    "ابدأ بجواب السؤال نفسه، ثم اذكر الحالة أو الخطوة الحالية عند الحاجة.",
    "لا تكرر اسم الموظف أو اسم العميل دون داعٍ.",
  ].join("\n");
}
