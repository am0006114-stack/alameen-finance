import { reserveAiBudget, finalizeAiUsage, V2BudgetBlockedError } from "./costGuard";
import type { ArchiveCase, ArchiveJudgeResult, DeepSeekReplayResult } from "./types";

function stripFence(value: string) {
  return String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseJson<T>(raw: string): T {
  const clean = stripFence(raw);
  try { return JSON.parse(clean) as T; } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("invalid_json_response");
    return JSON.parse(match[0]) as T;
  }
}

function deepSeekUsage(data: any) {
  return {
    inputTokens: Number(data?.usage?.prompt_tokens || 0),
    cachedInputTokens: Number(data?.usage?.prompt_cache_hit_tokens || 0),
    outputTokens: Number(data?.usage?.completion_tokens || 0),
  };
}

function openAiText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function openAiUsage(data: any) {
  return {
    inputTokens: Number(data?.usage?.input_tokens || 0),
    cachedInputTokens: Number(data?.usage?.input_tokens_details?.cached_tokens || 0),
    outputTokens: Number(data?.usage?.output_tokens || 0),
  };
}

function deepSeekModel() {
  return String(process.env.ALAMEEN_V2_ARCHIVE_DEEPSEEK_MODEL || "deepseek-v4-pro").trim();
}

function openAiJudgeModel() {
  return String(process.env.ALAMEEN_V2_ARCHIVE_OPENAI_JUDGE_MODEL || "gpt-5.6-luna").trim();
}

function openAiAdjudicatorModel() {
  return String(process.env.ALAMEEN_V2_ARCHIVE_OPENAI_ADJUDICATOR_MODEL || "gpt-5.6-terra").trim();
}

function replaySystemPrompt() {
  return `أنت عقل Replay تجريبي لـ V2 Conversation OS في مشروع الأمين للأقساط. هذا تحليل أرشيفي فقط ولا يجوز تنفيذ أي تغيير أو الادعاء بتنفيذه.

مهمتك في استدعاء واحد:
1) فهم الرسالة الحالية كأفعال حوارية متعددة، وليس intent واحدًا.
2) ربط المتابعات القصيرة والتصحيحات بالسياق السابق.
3) بناء خطة جواب تغطي كل ما طلبه العميل.
4) كتابة candidate reply بشري أردني مهني ومختصر.

قواعد حقيقة وتشغيل لا يجوز خرقها:
- الاسم التشغيلي الوحيد المسموح: الأمين للأقساط. ممنوع حرفيًا استخدام «الأمين للأقساط والتمويل» أو وصف الجهة بأنها شركة تمويل/إقراض. الجهة ليست بنكًا ولا تدعي ترخيص البنك المركزي.
- الموقع العام قبل الموعد: عمّان – شارع المدينة المنورة فقط. لا عنوان تفصيلي قبل الموعد الرسمي.
- لا توصيل؛ الاستلام من المكتب بموعد.
- رسوم فتح الملف 5 دنانير، منفصلة عن ثمن الجهاز والقسط الأول.
- لا Refund من سؤال أو استفسار. ولا استرداد فعلي بلا دليل دفع مؤكد.
- لا Cancellation من سؤال افتراضي، ولا تقلب الإلغاء/رفض الاستمرار إلى استمرار أو دفع.
- المستندات الحساسة لا تُطلب عبر واتساب؛ فقط عبر الرابط الرسمي المخصص عند توفره.
- إذا العميل طلب موظفًا، افهم ذلك كطلب handoff ولا تستمر بسلسلة أسئلة عامة.
- إذا قال العميل معلومة قبل لحظات، لا تسأله عنها مرة ثانية.
- إذا الرسالة فيها سؤالان أو أكثر، يجب أن تغطيهما جميعًا.
- historical_truth أدناه هو مصدر الحقيقة المتاح لحظة الرسالة. إذا ثقته limited/none، لا تختلق حقيقة مفقودة.
- لا تنقل أسماء حالات داخلية أو لغة نظام للعميل.

أخرج JSON فقط بالشكل:
{
  "interpretation": {
    "acts": [{"type":"ask|request_action|confirm|deny|correct|provide_fact|provide_reason|repair_request|acknowledge|greet|thank|handoff_request|complaint|unknown","topic":"string","action":null,"value":null,"evidence":"string"}],
    "topics":["string"],
    "references":[{"text":"string","resolves_to":null,"confidence":0.0}],
    "confidence":0.0
  },
  "plan": {"must_answer":["string"],"facts_used":["string"],"prohibited_claims":["string"],"action_handling":["string"]},
  "candidate_reply":"string",
  "confidence":0.0,
  "safety_flags":["string"]
}`;
}

export async function runDeepSeekArchiveReplay(input: {
  item: ArchiveCase;
  contextText: string;
  historicalActions: unknown[];
  deterministicAnchor: unknown;
}) {
  const apiKey = String(process.env.DEEPSEEK_V2_API_KEY || "").trim();
  if (!apiKey) throw new Error("DEEPSEEK_V2_API_KEY_missing");
  const model = deepSeekModel();
  const reservationId = await reserveAiBudget({ provider: "deepseek", model, purpose: "archive_replay", caseId: input.item.id, reserveUsd: 0.03 });
  const started = Date.now();
  let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: replaySystemPrompt() },
          { role: "user", content: `وقت الرسالة: ${input.item.source_created_at}\nدرجة إعادة بناء الحقيقة: ${input.item.historical_truth_confidence || "none"}\nمصدر الحقيقة: ${input.item.historical_truth_source || "—"}\n\nالسياق السابق:\n${input.contextText || "لا يوجد"}\n\nالرسالة الحالية:\n${input.item.customer_message}\n\nالحقيقة التاريخية المتاحة:\n${JSON.stringify(input.item.historical_truth || {})}\n\nطلبات/إجراءات تاريخية كانت موجودة قبل الرسالة:\n${JSON.stringify(input.historicalActions || [])}\n\nDeterministic safety anchor:\n${JSON.stringify(input.deterministicAnchor || {})}` },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const body = await response.text();
    let decoded: any = null;
    try { decoded = JSON.parse(body); } catch { decoded = null; }
    usage = deepSeekUsage(decoded);
    if (!response.ok) throw new Error(`deepseek_http_${response.status}:${body.slice(0, 700)}`);
    const raw = decoded?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("deepseek_empty_content");
    const result = parseJson<DeepSeekReplayResult>(raw);
    const cost = await finalizeAiUsage({ reservationId, provider: "deepseek", model, ...usage, requestId: decoded?.id || null });
    return { result, model, latencyMs: Date.now() - started, costUsd: cost || 0, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeAiUsage({ reservationId, provider: "deepseek", model, ...usage, errorCode: "archive_replay_failed", errorMessage: message });
    throw error;
  }
}

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    actual: { type: "object", additionalProperties: false, properties: {
      intent_alignment: { type: "integer", minimum: 0, maximum: 100 },
      multi_topic_coverage: { type: "integer", minimum: 0, maximum: 100 },
      continuity: { type: "integer", minimum: 0, maximum: 100 },
      factual_grounding: { type: "integer", minimum: 0, maximum: 100 },
      action_safety: { type: "integer", minimum: 0, maximum: 100 },
      human_tone: { type: "integer", minimum: 0, maximum: 100 },
      overall: { type: "integer", minimum: 0, maximum: 100 },
    }, required: ["intent_alignment","multi_topic_coverage","continuity","factual_grounding","action_safety","human_tone","overall"] },
    candidate: { type: "object", additionalProperties: false, properties: {
      intent_alignment: { type: "integer", minimum: 0, maximum: 100 },
      multi_topic_coverage: { type: "integer", minimum: 0, maximum: 100 },
      continuity: { type: "integer", minimum: 0, maximum: 100 },
      factual_grounding: { type: "integer", minimum: 0, maximum: 100 },
      action_safety: { type: "integer", minimum: 0, maximum: 100 },
      human_tone: { type: "integer", minimum: 0, maximum: 100 },
      overall: { type: "integer", minimum: 0, maximum: 100 },
    }, required: ["intent_alignment","multi_topic_coverage","continuity","factual_grounding","action_safety","human_tone","overall"] },
    winner: { type: "string", enum: ["actual","candidate","tie"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    critical_failures_actual: { type: "array", items: { type: "string" } },
    critical_failures_candidate: { type: "array", items: { type: "string" } },
    reasons: { type: "array", items: { type: "string" } },
    needs_adjudication: { type: "boolean" },
  },
  required: ["actual","candidate","winner","confidence","critical_failures_actual","critical_failures_candidate","reasons","needs_adjudication"],
};

function judgeInstructions() {
  return `أنت قاضٍ مستقل لاختبار جودة نظام واتساب للأمين للأقساط. قيّم الرد الفعلي التاريخي والرد المرشح الجديد بصورة مستقلة، ولا تفترض أن أيًا منهما صحيح.

مقياس الدرجات إلزامي:
- كل حقول الدرجات من 0 إلى 100، وليس من 0 إلى 10.
- 100 = ممتاز بلا ملاحظات، 90-99 = ممتاز مع ملاحظات طفيفة، 80-89 = جيد لكن يحتاج تحسين، 60-79 = ضعف واضح، أقل من 60 = فشل مهم.
- ممنوع إعطاء 9 بدل 90 أو 10 بدل 100.

حقائق وسياسات إلزامية عند التقييم:
- الاسم التشغيلي الوحيد المسموح هو «الأمين للأقساط». استخدام «الأمين للأقساط والتمويل» خطأ حرج.
- الجهة ليست بنكًا ولا شركة تمويل/إقراض ولا يجوز ادعاء ترخيص أو رقابة البنك المركزي.
- قبل الموعد الرسمي لا يذكر إلا «عمّان – شارع المدينة المنورة»، ولا يذكر العنوان التفصيلي.
- لا يوجد توصيل؛ الاستلام من المكتب بموعد.
- رسوم فتح الملف 5 دنانير، منفصلة عن ثمن الجهاز والقسط الأول.
- لا Refund من مجرد سؤال، ولا Refund فعلي بلا دليل دفع مؤكد.
- لا Cancellation من سؤال افتراضي، وممنوع قلب الإلغاء/رفض الاستمرار إلى استمرار أو دفع.
- المستندات الحساسة لا تُطلب عبر واتساب؛ فقط عبر الرابط الرسمي المخصص.
- PAYAMEN اسم دفع ممنوع؛ الأسماء المعتمدة فقط AMEEENPAY وAMENPAY.
- إذا طلب العميل موظفًا، تجاهل طلبه والاستمرار بسلسلة أسئلة عامة خطأ حرج.
- إذا قال العميل معلومة قبل لحظات، طلبها منه مرة أخرى خطأ استمرارية.

ركز على: فهم قصد العميل، تغطية كل النقاط، الاستمرارية مع السياق، عدم اختلاق حقائق، أمان الإلغاء/الدفع/الاسترداد، والأسلوب البشري الطبيعي.
أي قلب واضح للإلغاء إلى استمرار/دفع، تجاهل طلب موظف، ادعاء حالة غير مثبتة، اسم تجاري ممنوع، رابط/تعليمات غير مرتبطة بالسؤال، أو تجاهل سؤال صريح = critical failure.
إذا historical_truth_confidence = limited/none فلا تعاقب الرد على عدم معرفة شيء غير موثق، لكن عاقبه إن اخترعه.
أعد JSON وفق schema فقط.`;
}

async function callOpenAiJudge(input: {
  item: ArchiveCase;
  contextText: string;
  deepSeek: DeepSeekReplayResult;
  model: string;
  purpose: string;
  reserveUsd: number;
  effort: "none" | "low" | "medium";
  localFindings?: { actual: string[]; candidate: string[] };
}) {
  const apiKey = String(process.env.OPENAI_V2_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_V2_API_KEY_missing");
  const reservationId = await reserveAiBudget({ provider: "openai", model: input.model, purpose: input.purpose, caseId: input.item.id, reserveUsd: input.reserveUsd });
  let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        instructions: judgeInstructions(),
        input: `وقت الرسالة: ${input.item.source_created_at}\ntruth confidence: ${input.item.historical_truth_confidence || "none"}\n\nالسياق السابق:\n${input.contextText || "لا يوجد"}\n\nرسالة العميل:\n${input.item.customer_message}\n\nالحقيقة التاريخية:\n${JSON.stringify(input.item.historical_truth || {})}\n\nالرد الفعلي التاريخي:\n${input.item.actual_reply || "[لا يوجد رد فعلي محفوظ]"}\n\nفهم وخطة V2:\n${JSON.stringify({ interpretation: input.deepSeek.interpretation, plan: input.deepSeek.plan, safety_flags: input.deepSeek.safety_flags })}\n\nرد V2 المرشح:\n${input.deepSeek.candidate_reply}`,
        reasoning: { effort: input.effort },
        text: { format: { type: "json_schema", name: "alameen_archive_judge", strict: true, schema: judgeSchema }, verbosity: "low" },
        max_output_tokens: 950,
        store: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const body = await response.text();
    let decoded: any = null;
    try { decoded = JSON.parse(body); } catch { decoded = null; }
    usage = openAiUsage(decoded);
    if (!response.ok) throw new Error(`openai_http_${response.status}:${body.slice(0, 700)}`);
    const raw = openAiText(decoded);
    if (!raw) throw new Error("openai_empty_output");
    const result = parseJson<ArchiveJudgeResult>(raw);
    const cost = await finalizeAiUsage({ reservationId, provider: "openai", model: input.model, ...usage, requestId: decoded?.id || null });
    return { result, model: input.model, costUsd: cost || 0, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizeAiUsage({ reservationId, provider: "openai", model: input.model, ...usage, errorCode: "archive_judge_failed", errorMessage: message });
    throw error;
  }
}

export async function runOpenAiJudge(input: { item: ArchiveCase; contextText: string; deepSeek: DeepSeekReplayResult; localFindings?: { actual: string[]; candidate: string[] } }) {
  return callOpenAiJudge({ ...input, model: openAiJudgeModel(), purpose: "archive_judge", reserveUsd: 0.01, effort: "low" });
}

export async function runOpenAiAdjudicator(input: { item: ArchiveCase; contextText: string; deepSeek: DeepSeekReplayResult; localFindings?: { actual: string[]; candidate: string[] } }) {
  return callOpenAiJudge({ ...input, model: openAiAdjudicatorModel(), purpose: "archive_adjudication", reserveUsd: 0.05, effort: "medium" });
}

export { V2BudgetBlockedError };
