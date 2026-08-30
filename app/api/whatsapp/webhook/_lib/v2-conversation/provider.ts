import type {
  V2ActionKey,
  V2DialogueAct,
  V2DialogueActType,
  V2InterpretedTurn,
  V2ReferenceCandidate,
  V2TopicKey,
} from "./types";
import { uniqueStrings, v2Language, v2Normalize } from "./normalize";

type RawProviderAct = {
  type?: unknown;
  topic?: unknown;
  text?: unknown;
  action?: unknown;
  target?: unknown;
  value?: unknown;
  confidence?: unknown;
};

type RawProviderResult = {
  language?: unknown;
  acts?: unknown;
  references?: unknown;
  confidence?: unknown;
};

const ACT_TYPES = new Set<V2DialogueActType>([
  "ask", "request_action", "confirm", "deny", "correct", "provide_fact", "provide_reason",
  "repair_request", "acknowledge", "greet", "thank", "handoff_request", "complaint", "unknown",
]);

const TOPICS = new Set<V2TopicKey>([
  "application_status", "review_timing", "cancellation", "continuation", "refund",
  "payment_fee", "payment_method", "payment_timing", "payment_recipient", "receipt_upload",
  "first_installment", "installment_amount", "installment_duration", "product_price", "products",
  "office_location", "delivery", "requirements", "identity", "salary", "guarantor", "site_issue",
  "human_handoff", "call_request", "trust", "business_identity", "business_website",
  "correction", "repair", "acknowledgement", "greeting", "unknown",
]);

const ACTIONS = new Set<V2ActionKey>([
  "cancel_application", "continue_application", "decline_application", "request_refund",
  "stop_refund", "upload_receipt", "human_handoff", "request_call", "change_application", "none",
]);

function clampConfidence(value: unknown, fallback = 0.75) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function stripFence(value: string) {
  return String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractText(data: unknown) {
  const obj = data as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((item) => item?.text || "").join("\n").trim();
  return "";
}

function parseJson(raw: string): RawProviderResult | null {
  const clean = stripFence(raw);
  if (!clean) return null;
  try {
    return JSON.parse(clean) as RawProviderResult;
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as RawProviderResult;
    } catch {
      return null;
    }
  }
}

function sanitizeAct(item: RawProviderAct, index: number, fallbackText: string): V2DialogueAct | null {
  const type = String(item.type || "") as V2DialogueActType;
  const topic = String(item.topic || "") as V2TopicKey;
  if (!ACT_TYPES.has(type) || !TOPICS.has(topic)) return null;
  const actionRaw = item.action === null || item.action === undefined ? null : String(item.action);
  const action = actionRaw && ACTIONS.has(actionRaw as V2ActionKey) ? actionRaw as V2ActionKey : null;
  return {
    id: `l${index + 1}`,
    type,
    topic,
    text: String(item.text || fallbackText || "").trim(),
    action,
    target: item.target === null || item.target === undefined ? null : String(item.target),
    value: item.value === null || item.value === undefined ? null : String(item.value),
    confidence: clampConfidence(item.confidence, 0.75),
    source: "llm",
  };
}

function sanitizeReferences(value: unknown): V2ReferenceCandidate[] {
  if (!Array.isArray(value)) return [];
  const out: V2ReferenceCandidate[] = [];
  for (const item of value.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const kind = String(obj.kind || "");
    if (!["deictic", "short_answer", "correction", "repair", "explicit"].includes(kind)) continue;
    const targetTopic = TOPICS.has(String(obj.targetTopic || "") as V2TopicKey)
      ? String(obj.targetTopic) as V2TopicKey
      : null;
    out.push({
      text: String(obj.text || "").trim(),
      kind: kind as V2ReferenceCandidate["kind"],
      targetTopic,
      targetActId: obj.targetActId ? String(obj.targetActId) : null,
      confidence: clampConfidence(obj.confidence, 0.7),
    });
  }
  return out;
}

export type V2InterpreterProviderResult = {
  ok: boolean;
  turn: V2InterpretedTurn | null;
  model: string | null;
  latencyMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse: string | null;
};

export async function interpretWithProvider(input: {
  customerText: string;
  messageType?: string | null;
  recentConversation?: string | null;
  openLoops?: Array<{ topic: string; owedBy: string; question?: string | null }>;
  knownFacts?: Array<{ key: string; value: string; topic: string }>;
}): Promise<V2InterpreterProviderResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = String(process.env.ALAMEEN_V2_INTERPRETER_MODEL || process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro").trim();
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const timeoutRaw = Number(process.env.ALAMEEN_V2_INTERPRETER_TIMEOUT_MS || "18000");
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.min(28000, Math.max(8000, timeoutRaw)) : 18000;
  const started = Date.now();

  if (!apiKey) {
    return {
      ok: false, turn: null, model, latencyMs: 0,
      errorCode: "missing_api_key", errorMessage: "DEEPSEEK_API_KEY is missing", rawResponse: null,
    };
  }

  const systemPrompt = `أنت Turn Interpreter فقط لنظام واتساب الأمين للأقساط.
مهمتك فهم الرسالة الحالية، وليس كتابة رد للعميل وليس تنفيذ أي إجراء.

أخرج JSON صالح فقط بهذا الشكل:
{
  "language":"ar|en|mixed",
  "acts":[
    {
      "type":"ask|request_action|confirm|deny|correct|provide_fact|provide_reason|repair_request|acknowledge|greet|thank|handoff_request|complaint|unknown",
      "topic":"application_status|review_timing|cancellation|continuation|refund|payment_fee|payment_method|payment_timing|payment_recipient|receipt_upload|first_installment|installment_amount|installment_duration|product_price|products|office_location|delivery|requirements|identity|salary|guarantor|site_issue|human_handoff|call_request|trust|business_identity|business_website|correction|repair|acknowledgement|greeting|unknown",
      "text":"الجزء الذي يدل على الفعل",
      "action":"cancel_application|continue_application|decline_application|request_refund|stop_refund|upload_receipt|human_handoff|request_call|change_application|none",
      "target":null,
      "value":null,
      "confidence":0.0
    }
  ],
  "references":[
    {"text":"هيك","kind":"deictic|short_answer|correction|repair|explicit","targetTopic":null,"targetActId":null,"confidence":0.0}
  ],
  "confidence":0.0
}

قواعد إلزامية:
- الرسالة قد تحتوي عدة أفعال/أسئلة. لا تختصرها إلى intent واحد.
- "كم الدفعة الأولى ووين موقعكم" = سؤالان منفصلان على الأقل.
- "بدي ألغي لأني مسافر" = request_action cancellation + provide_reason.
- "بدي موظف" = handoff_request human_handoff.
- "ما فهمت/وضح/كيف يعني" = repair_request وليس noise.
- "الرسوم*" = correct/correction.
- "هيك/هاد/ماعندي/اه/لا" قد تكون مراجع للسياق؛ سجل reference ولا تخمن حقيقة تشغيلية.
- لا تستنتج نجاح دفع أو موافقة أو استرداد من كلام العميل.
- لا تكتب أي customer reply.`;

  const userPrompt = `الرسالة الحالية:
${input.customerText}

نوع الرسالة: ${input.messageType || "text"}

السياق القريب:
${input.recentConversation || "لا يوجد"}

الأسئلة/الحلقات المفتوحة:
${JSON.stringify(input.openLoops || [])}

حقائق محادثية سابقة (ليست حقائق مالية رسمية):
${JSON.stringify(input.knownFacts || [])}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 1100,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
    const rawBody = await response.text();
    if (!response.ok) {
      return {
        ok: false, turn: null, model, latencyMs: Date.now() - started,
        errorCode: `http_${response.status}`,
        errorMessage: rawBody.slice(0, 1200) || `HTTP ${response.status}`,
        rawResponse: rawBody.slice(0, 6000),
      };
    }

    let decoded: unknown = null;
    try { decoded = JSON.parse(rawBody); } catch { decoded = null; }
    const modelText = extractText(decoded);
    const parsed = parseJson(modelText);
    if (!parsed || !Array.isArray(parsed.acts)) {
      return {
        ok: false, turn: null, model, latencyMs: Date.now() - started,
        errorCode: "invalid_interpreter_json",
        errorMessage: "Interpreter returned invalid structured JSON",
        rawResponse: rawBody.slice(0, 6000),
      };
    }

    const acts = (parsed.acts as RawProviderAct[])
      .slice(0, 16)
      .map((item, index) => sanitizeAct(item, index, input.customerText))
      .filter((item): item is V2DialogueAct => Boolean(item));

    if (!acts.length) {
      return {
        ok: false, turn: null, model, latencyMs: Date.now() - started,
        errorCode: "empty_interpreter_acts",
        errorMessage: "Interpreter returned no valid acts",
        rawResponse: rawBody.slice(0, 6000),
      };
    }

    const references = sanitizeReferences(parsed.references);
    const topics = uniqueStrings(acts.map((item) => item.topic));
    const requestedActions = uniqueStrings(
      acts.map((item) => item.action).filter((item): item is V2ActionKey => Boolean(item && item !== "none")),
    );

    return {
      ok: true,
      model,
      latencyMs: Date.now() - started,
      errorCode: null,
      errorMessage: null,
      rawResponse: rawBody.slice(0, 6000),
      turn: {
        version: "2.0-phase1",
        source: "llm",
        language: ["ar", "en", "mixed"].includes(String(parsed.language))
          ? String(parsed.language) as "ar" | "en" | "mixed"
          : v2Language(input.customerText),
        normalizedText: v2Normalize(input.customerText),
        acts,
        topics,
        references,
        corrections: acts
          .filter((item) => item.type === "correct" && item.value)
          .map((item) => ({
            originalText: item.text,
            replacement: String(item.value),
            targetTopic: item.topic === "correction" ? null : item.topic,
            confidence: item.confidence,
          })),
        requestedActions,
        confidence: clampConfidence(parsed.confidence, Math.max(...acts.map((item) => item.confidence))),
        warnings: [],
        provider: { model, latencyMs: Date.now() - started, parseMode: "json", errorCode: null, errorMessage: null },
      },
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return {
      ok: false, turn: null, model, latencyMs: Date.now() - started,
      errorCode: timeout ? "timeout" : "network_error",
      errorMessage: timeout ? `Interpreter timed out after ${timeoutMs}ms` : (error instanceof Error ? error.message : String(error)),
      rawResponse: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
