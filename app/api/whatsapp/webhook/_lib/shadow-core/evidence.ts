import { normalizeArabicText } from "../text";
import type {
  ShadowAgentId,
  ShadowConversationSnapshot,
  ShadowDeviceChangeRequest,
  ShadowEvidence,
} from "./types";

function compact(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function evidenceId(prefix: string, value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(16)}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(compact).filter(Boolean)));
}

function customerLines(snapshot: ShadowConversationSnapshot | null | undefined) {
  const direct = Array.isArray(snapshot?.lastCustomerMessages)
    ? snapshot?.lastCustomerMessages.map(String)
    : [];
  const fromContext = String(snapshot?.conversationContext || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^العميل(?:\s*\/\s*type:[^:]+)?\s*:\s*(.*)$/i)?.[1] || "")
    .filter(Boolean);
  return unique([...direct, ...fromContext]);
}

function assistantLines(snapshot: ShadowConversationSnapshot | null | undefined) {
  const direct = Array.isArray(snapshot?.lastAssistantReplies)
    ? snapshot?.lastAssistantReplies.map(String)
    : [];
  const fromContext = String(snapshot?.conversationContext || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^الأمين(?:\s*\/\s*type:[^:]+)?\s*:\s*(.*)$/i)?.[1] || "")
    .filter(Boolean);
  return unique([...direct, ...fromContext]);
}

function extractFormDevice(line: string) {
  const clean = compact(line);
  if (!/طلب تعديل جهاز من الرابط الرسمي/i.test(clean)) return null;
  const model = clean.match(/الجهاز الجديد\s*:\s*(.+?)(?=\s+السعة\s*:|\s+اللون المطلوب\s*:|$)/i)?.[1];
  const capacity = clean.match(/السعة\s*:\s*([^\s،]+)/i)?.[1];
  const color = clean.match(/اللون المطلوب\s*:\s*(.+?)(?=\s+اللون البديل\s*:|\s+ملاحظة\s*:|$)/i)?.[1];
  const previousDevice = clean.match(/الجهاز الحالي\s*:\s*(.+?)(?=\s+الجهاز الجديد\s*:|$)/i)?.[1];
  const requestedDevice = [model, capacity, color ? `اللون المطلوب: ${color}` : ""]
    .map(compact)
    .filter(Boolean)
    .join(" - ");
  if (!requestedDevice) return null;
  return {
    requestedDevice,
    previousDevice: compact(previousDevice) || null,
  };
}

function extractDeviceModel(line: string) {
  const clean = compact(line);
  const english = clean.match(/\b(?:iPhone\s*\d{1,2}(?:\s*(?:Pro\s*Max|Pro|Plus|Max))?|Samsung\s+[A-Za-z0-9-]+(?:\s*(?:Ultra|Plus|FE))?|Galaxy\s+[A-Za-z0-9-]+(?:\s*(?:Ultra|Plus|FE))?|HONOR\s+[A-Za-z0-9-]+(?:\s*Pro)?|Xiaomi\s+[A-Za-z0-9-]+(?:\s*Pro)?|Redmi\s+[A-Za-z0-9-]+(?:\s*Pro)?|OPPO\s+[A-Za-z0-9-]+(?:\s*Pro)?|Realme\s+[A-Za-z0-9-]+(?:\s*Pro)?|Pixel\s+\d+(?:\s*Pro)?|S\d{2}\s*(?:Ultra|Plus|FE)?)(?:\s*[-–]?\s*(?:64|128|256|512)\s*GB|\s*[-–]?\s*1\s*TB)?/i)?.[0];
  if (english) return compact(english);

  const arabic = clean.match(/(?:ايفون|آيفون)\s*\d{1,2}(?:\s*(?:برو\s*ماكس|برو|بلس|ماكس))?(?:\s*(?:64|128|256|512)\s*(?:جيجا|GB))?/i)?.[0];
  return compact(arabic) || null;
}

function isDeviceChangeRequest(line: string) {
  const text = normalizeArabicText(line);
  return [
    "بدي اغير الجهاز",
    "اريد تغيير الجهاز",
    "تغيير الجهاز",
    "تعديل الجهاز",
    "غيرولي الجهاز",
    "غير الجهاز",
    "بدل الجهاز",
    "الجهاز الجديد",
  ].some((phrase) => text.includes(normalizeArabicText(phrase)));
}

export function extractConversationEvidence(
  snapshot: ShadowConversationSnapshot | null | undefined,
): { evidence: ShadowEvidence[]; deviceChangeRequest: ShadowDeviceChangeRequest } {
  const lines = customerLines(snapshot);
  const evidence: ShadowEvidence[] = [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const form = extractFormDevice(line);
    if (form) {
      const id = evidenceId("device-form", `${form.requestedDevice}|${line}`);
      evidence.push({
        id,
        kind: "device_change_submission",
        source: "conversation_history",
        claim: "تم إرسال طلب تعديل الجهاز من الرابط الرسمي للمراجعة.",
        value: form.requestedDevice,
        excerpt: compact(line).slice(0, 320),
        confidence: "high",
      });
      return {
        evidence,
        deviceChangeRequest: {
          requested: true,
          requestedDevice: form.requestedDevice,
          previousDevice: form.previousDevice,
          status: "submitted_for_review",
          source: "official_form",
          evidenceId: id,
        },
      };
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!isDeviceChangeRequest(line)) continue;
    const requestedDevice = extractDeviceModel(line);
    const id = evidenceId("device-request", `${requestedDevice || "unspecified"}|${line}`);
    evidence.push({
      id,
      kind: "device_change_request",
      source: "conversation_history",
      claim: requestedDevice
        ? `العميل طلب تعديل الجهاز إلى ${requestedDevice}.`
        : "العميل طلب تعديل الجهاز دون ظهور جهاز بديل واضح في السجل.",
      value: requestedDevice,
      excerpt: compact(line).slice(0, 320),
      confidence: requestedDevice ? "high" : "medium",
    });
    return {
      evidence,
      deviceChangeRequest: {
        requested: true,
        requestedDevice,
        previousDevice: null,
        status: "customer_requested",
        source: "conversation_history",
        evidenceId: id,
      },
    };
  }

  return {
    evidence,
    deviceChangeRequest: {
      requested: false,
      requestedDevice: null,
      previousDevice: null,
      status: "none",
      source: "none",
      evidenceId: null,
    },
  };
}

export function preferredAgentFromConversation(
  snapshot: ShadowConversationSnapshot | null | undefined,
): ShadowAgentId | null {
  const names: Array<{ id: ShadowAgentId; pattern: RegExp }> = [
    { id: "tala", pattern: /(?:معك|انا)\s+تالا/i },
    { id: "fadwa", pattern: /(?:معك|انا)\s+فدوة/i },
    { id: "abdullah", pattern: /(?:معك|انا)\s+عبدالله/i },
    { id: "abdulrahman", pattern: /(?:معك|انا)\s+عبدالرحمن/i },
    { id: "omran", pattern: /(?:معك|انا)\s+عمران/i },
  ];

  for (const line of assistantLines(snapshot)) {
    const match = names.find((entry) => entry.pattern.test(line));
    if (match) return match.id;
  }
  return null;
}
