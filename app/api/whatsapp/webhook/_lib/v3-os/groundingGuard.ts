import {
  buildIphone18AuthoritativeReply,
  IPHONE18_COLORS,
  IPHONE18_PRODUCTS,
  isIphone18Question,
} from "./businessTruthRegistry";
import { normalizeArabic } from "./text";
import type { InterpretedTurn, TruthBundle } from "./types";

export type GroundingGuardResult = { pass: true; reply: string } | { pass: false; replacement: string; reason: string };

function n(value: string | null | undefined) {
  return normalizeArabic(String(value || "")).toLowerCase().replace(/[؟?!.,،؛:]+/g, " ").replace(/\s+/g, " ").trim();
}

function actualMediaEvent(turn: InterpretedTurn) {
  const text = String(turn.rawText || "");
  return /تم استلام (?:صورة|فيديو|مستند|ملف|رسالة صوتية) من العميل|صورة مرفقة مع تعليق|فيديو مرفق|رسالة صوتية من العميل/i.test(text);
}

function iphone18GroundingViolation(question: string, reply: string) {
  const q = n(question);
  const r = n(reply);
  if (!isIphone18Question(question)) return null;

  if (/19\s*ديسمبر\s*2026|3\s*أشهر|ثلاثه\s*أشهر|ثلاثة\s*أشهر/i.test(reply)) return "stale_release_date";
  if (/(?:توصيل\s+(?:للبيت|للمنزل)|بنوصله|بنوصلها|يوصلك\s+للبيت)/.test(r)) return "false_delivery_claim";
  const immediatePickupClaim = /(?:الاستلام\s+(?:فوري|اليوم)|متوفر\s+(?:هسا|الان|الآن)\s+للاستلام|بتستلمه\s+(?:فورا|فورًا|اليوم))/.test(r);
  if (immediatePickupClaim) return "false_immediate_pickup_claim";

  const asksPrice = /(?:سعر|بكم|قديش|كم)/.test(q);
  if (asksPrice) {
    const allowed = new Set(IPHONE18_PRODUCTS.map((x) => x.priceJod));
    const moneyNumbers = Array.from(reply.matchAll(/(?:^|\s)([1-9]\d{2,3})(?:\.\d+)?\s*(?:د\.?\s*أ|دينار|jod)(?=\s|[.,،؛:!?؟]|$)/gi))
      .map((m) => Number(m[1]))
      .filter((x) => Number.isFinite(x));
    if (moneyNumbers.some((value) => !allowed.has(value as never))) return "unsupported_iphone18_price";
  }

  const asksDiscount = /(?:خصم|5\s*%|٥\s*٪|خمسه\s*بالم)/.test(q);
  if (asksDiscount) {
    const correctlyDenied = /(?:ما\s+علي(?:ه|ها)|لا\s+يوجد|بدون|مستثن).{0,25}(?:خصم|5\s*%|٥\s*٪)|(?:خصم|5\s*%|٥\s*٪).{0,25}(?:ما\s+علي(?:ه|ها)|لا\s+يوجد|مستثن)/.test(r);
    if (!correctlyDenied) return "iphone18_discount_not_denied";
  }

  const asksWarranty = /(?:كفال|ضمان|isystems)/i.test(q);
  if (asksWarranty && !/isystems/i.test(reply)) return "iphone18_warranty_missing";

  const asksRegion = /(?:نسخت|نسخه|نسخة|شرق\s*اوسط|الشرق\s*الأوسط|الشرق\s*الاوسط)/.test(q);
  if (asksRegion && !/(?:شرق\s*اوسط|الشرق\s*الأوسط|الشرق\s*الاوسط)/.test(r)) return "iphone18_region_missing";

  const asksPickup = /(?:متى|استلم|استلام|توصيل|يوصل|فوري|مخزون)/.test(q);
  if (asksPickup && !(r.includes("شهر") && r.includes(n("الموافقة النهائية")) && /موعد/.test(r))) {
    return "iphone18_pickup_rule_missing";
  }

  const asksColors = /(?:لون|الوان|الألوان|الوانه|ألوانه)/.test(q);
  if (asksColors && !IPHONE18_COLORS.some((color) => n(color) && r.includes(n(color)))) return "iphone18_color_truth_missing";

  return null;
}

export function enforceGroundedBusinessEgress(input: { reply: string; turn: InterpretedTurn; truth: TruthBundle }): GroundingGuardResult {
  const reply = String(input.reply || "").trim();
  if (!reply) return { pass: true, reply };

  if (/(?:وصلني|وصلتني|وصلت)\s+(?:الصوره|الصورة|المرفق|الملف|الفيديو|الرسالة الصوتية)/i.test(reply) && !actualMediaEvent(input.turn)) {
    return {
      pass: false,
      reason: "unsupported_media_receipt_claim",
      replacement: "إذا بدك تبعث صورة أو مرفق، ابعثه أولًا وبعد وصوله فعليًا بقدر أتعامل معه. ما رح أقول إنه وصل قبل ما يظهر عندي كرسالة مرفقة فعلًا.",
    };
  }

  const iphone18Violation = iphone18GroundingViolation(input.turn.rawText, reply);
  if (iphone18Violation) {
    return {
      pass: false,
      reason: iphone18Violation,
      replacement: buildIphone18AuthoritativeReply(input.turn.rawText)
        || "أجهزة iPhone 18 Pro وPro Max موجودة ضمن الأجهزة المعروضة للتقديم، والاستلام بعد شهر من الموافقة النهائية وبموعد مؤكد من المكتب.",
    };
  }

  return { pass: true, reply };
}
