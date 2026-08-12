import type { CustomerIntent } from "../types";
import type {
  ShadowAgentId,
  ShadowAgentRole,
  ShadowDecisionMode,
  ShadowFacts,
  ShadowRouteDecision,
  ShadowTopic,
} from "./types";

function stableIndex(seed: string, modulo: number) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % Math.max(1, modulo);
}

function agentRole(agent: ShadowAgentId): ShadowAgentRole {
  if (agent === "omran") return "escalation";
  if (agent === "abdullah" || agent === "abdulrahman") return "study";
  return "followup";
}

function pickAgent(
  role: ShadowAgentRole,
  seed: string,
  preferredAgent?: ShadowAgentId | null,
): ShadowAgentId {
  if (preferredAgent && agentRole(preferredAgent) === role) return preferredAgent;
  if (role === "escalation") return "omran";
  if (role === "study") return stableIndex(seed, 2) === 0 ? "abdullah" : "abdulrahman";
  return stableIndex(seed, 2) === 0 ? "tala" : "fadwa";
}

export function shadowAgentName(agent: ShadowAgentId) {
  if (agent === "tala") return "تالا";
  if (agent === "fadwa") return "فدوة";
  if (agent === "abdullah") return "عبدالله";
  if (agent === "abdulrahman") return "عبدالرحمن";
  return "عمران";
}

function hasAnyTopic(topics: ShadowTopic[], values: ShadowTopic[]) {
  return topics.some((topic) => values.includes(topic));
}

function modeFromRequestedModel(requestedModel: string | null | undefined): ShadowDecisionMode | null {
  const value = String(requestedModel || "").toLowerCase();
  if (!value) return null;
  return value.includes("flash") ? "flash" : "pro";
}

export function routeShadowAgent(input: {
  topics: ShadowTopic[];
  customerText: string;
  initialIntent: CustomerIntent;
  facts: ShadowFacts;
  requestedModel?: string | null;
  seed?: string | null;
  preferredAgent?: ShadowAgentId | null;
}): ShadowRouteDecision {
  const seed = String(
    input.seed ||
      input.facts.trackingId ||
      input.facts.customerName ||
      input.customerText ||
      "alameen-shadow",
  );

  const escalationTopics: ShadowTopic[] = [
    "complaint",
    "trust",
    "cancellation",
    "refund",
    "stop_refund",
  ];
  const studyTopics: ShadowTopic[] = ["requirements", "eligibility", "procedures", "document_upload"];
  const contactTopics: ShadowTopic[] = [
    "contact_number",
    "phone_not_answered",
    "human_agent",
    "staff_change",
  ];
  const sensitiveTopics: ShadowTopic[] = [
    "order_status",
    "review_time",
    "bank_requirement",
    "regulatory_status",
    "business_identity",
    "early_settlement",
    "payment_method",
    "payment_status",
    "post_approval_steps",
    "requirements",
    "office_location",
    "independence",
    "delivery",
    "supplier_delay",
    "device_change",
    "cancellation",
    "refund",
    "stop_refund",
    "contact_number",
    "phone_not_answered",
    "human_agent",
    "staff_change",
    "voice_message",
    "media_upload",
    "document_upload",
    "unsupported_message",
    "acknowledgement",
    "voluntary_opt_out",
    "office_payment_request",
    "business_hours",
    "eligibility",
  ];

  const role: ShadowAgentRole = hasAnyTopic(input.topics, contactTopics)
    ? "followup"
    : hasAnyTopic(input.topics, escalationTopics)
      ? "escalation"
      : hasAnyTopic(input.topics, studyTopics)
        ? "study"
        : "followup";
  const agent = pickAgent(role, seed, input.preferredAgent);
  const forcedMode = modeFromRequestedModel(input.requestedModel);
  const sensitiveRoute = hasAnyTopic(input.topics, sensitiveTopics);

  if (sensitiveRoute) {
    return {
      agent,
      agentName: shadowAgentName(agent),
      role,
      mode: "deterministic",
      reason: "مسار حساس يعتمد على حقائق الطلب أو سياسة اتصال ثابتة، لذلك لا يُسمح للنموذج باتخاذ قرار.",
      sensitiveRoute: true,
      templateId: null,
      requestedModel: null,
    };
  }

  if (forcedMode) {
    return {
      agent,
      agentName: shadowAgentName(agent),
      role,
      mode: forcedMode,
      reason: `تم احترام نموذج الاختبار المطلوب: ${String(input.requestedModel || "")}.`,
      sensitiveRoute: false,
      templateId: null,
      requestedModel: String(input.requestedModel || ""),
    };
  }

  if (role === "escalation") {
    return {
      agent,
      agentName: shadowAgentName(agent),
      role,
      mode: "pro",
      reason: "الرسالة تحتاج فهم سياق وتهدئة دقيقة، لذلك تم توجيهها لعمران باستخدام Pro.",
      sensitiveRoute: false,
      templateId: null,
      requestedModel: "deepseek-v4-pro",
    };
  }

  const compact = String(input.customerText || "").trim();
  const socialOnly = /^(?:مرحبا|مرحباً|اهلا|أهلا|شكرا|شكرًا|يعطيك العافيه|يعطيك العافية|تمام|اوكي|ok|okay|👍|✅|👌|🙏|🌿|❤️|❤|🙂|😊)[\s.!،,؟?]*$/i.test(compact);
  return {
    agent,
    agentName: shadowAgentName(agent),
    role,
    mode: socialOnly ? "flash" : "pro",
    reason: socialOnly
      ? "رسالة اجتماعية قصيرة وغير حساسة؛ Flash كافٍ للصياغة."
      : "الرسالة تحتاج فهمًا للسياق؛ Pro هو الأنسب.",
    sensitiveRoute: false,
    templateId: null,
    requestedModel: socialOnly ? "deepseek-v4-flash" : "deepseek-v4-pro",
  };
}

export function shadowAgentStyle(agent: ShadowAgentId) {
  if (agent === "omran") {
    return [
      "أنت عمران من متابعة الحالات، وتستخدم اسمك فقط عند بداية تدخل جديد أو عندما يطلب العميل مسؤولًا.",
      "أسلوبك دافئ وهادئ ومباشر: اعترف بالمشكلة، ثم اذكر الحقيقة المؤكدة والخيار الواقعي فقط.",
      "لا تضغط على العميل، ولا تعد بموعد، ولا تدّع تنفيذ تصعيد أو استرداد أو اتصال.",
    ].join("\n");
  }
  if (agent === "abdullah" || agent === "abdulrahman") {
    return [
      `أنت ${shadowAgentName(agent)} من دراسة الملفات، وتستخدم اسمك فقط عند بداية تدخل جديد.`,
      "اشرح المتطلبات بهدوء، ولا تضمن القبول، ولا تطلب مستندًا غير موجود صراحة في الحقائق.",
      "أي هوية أو كشف راتب أو بيانات كفيل تُرفع فقط عبر الرابط الرسمي المرتبط بالطلب، وليس عبر واتساب.",
    ].join("\n");
  }
  return [
    `أنت ${shadowAgentName(agent)} من المتابعة، وتستخدم اسمك فقط عند بداية محادثة أو انتقال واضح بين الموظفين.`,
    "ابدأ بجواب السؤال نفسه، ثم اذكر الحالة أو الخطوة الحالية عند الحاجة.",
    "لا تكرر اسم العميل أو اسم الموظف في كل رسالة.",
  ].join("\n");
}
