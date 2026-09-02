import type { ActionKey, DialogueAct, InterpretedTurn, TopicKey } from "./types";
import { hasAny, isQuestion, normalizeArabic } from "./text";

function id(turnId: string, i: number) { return `${turnId}:a${i + 1}`; }
function unique<T>(a: T[]) { return Array.from(new Set(a)); }

export function interpretTurn(input: { turnId: string; customerText: string }): InterpretedTurn {
  const raw = String(input.customerText || "").trim();
  const n = normalizeArabic(raw);
  const pending: Array<Omit<DialogueAct,"id">> = [];
  const add = (type: DialogueAct["type"], topic: TopicKey, confidence: number, action: ActionKey = "none", value: string | null = null) => {
    pending.push({ type, topic, text: raw, confidence, action, value, source: "deterministic" });
  };

  if (!raw) add("unknown","unknown",0.2);
  const bareTracking = /^AM-\d{8,}$/i.test(raw);
  const bareJordanPhone = /^(?:(?:\+?962|00962|0)?7[789]\d{7})$/.test(raw.replace(/[\s-]/g, ""));
  if (bareTracking) add("provide_fact","application_status",0.995,"none",raw.toUpperCase());
  else if (bareJordanPhone) add("provide_fact","application_status",0.99,"none",raw);
  if (hasAny(n,["مرحبا","السلام عليكم","هلا","اهلا"])) add("greet","greeting",0.98);
  if (hasAny(n,["شكرا","يسلمو","يعطيك العافيه"])) add("thank","thanks",0.98);
  if (hasAny(n,["ما فهمت","مش فاهم","كيف يعني","وضح","وضحي"])) add("repair_request","repair",0.99);

  const manager = hasAny(n,["بدي المدير","احكي مع المدير","بدي مسؤول","احكي مع مسؤول","بدي الاداره","بدي الإدارة","احكي مع الاداره","احكي مع الإدارة","عمران"]);
  const staff = hasAny(n,["بدي موظف","بدي موضف","احكي مع موظف","احكي مع موضف","موظف احكي معه","موضف احكي معه","حدا احكي معه","شخص احكي معه"]);
  const call = hasAny(n,["اتصلوا في","اتصل في","بدي مكالمه","رنوا علي","احكوا معي تلفون"]);
  if (manager) add("request_role","manager_request",0.99,"switch_ai_role");
  else if (staff) add("request_role","human_request",0.99,"switch_ai_role");
  if (call) add("ask","call_request",0.98,"record_call_preference");

  const stopRefund = hasAny(n,["تراجعت عن الاسترداد","ما بدي الاسترداد","وقف الاسترداد","الغي الاسترداد","إلغاء الاسترداد","بدي اكمل بدل الاسترداد"]);
  const reopen = hasAny(n,["تراجعت عن الالغاء","تراجعت عن الإلغاء","الغاء الالغاء","إلغاء الإلغاء","فك الالغاء","فك الإلغاء","اعاده فتح الطلب","إعادة فتح الطلب","رجع افتح الطلب","بدي ارجع اكمل","غيرت رايي وبدي اكمل","غيرت رأيي وبدي أكمل"]);
  const cancelMention = hasAny(n,["الغاء الطلب","إلغاء الطلب","الغي الطلب","بدي الغي","الغاء طلبي","إلغاء طلبي","ما بدي اكمل","وقف الطلب","الغي","الغاء"]);
  const continueMention = hasAny(n,["بدي اكمل","كمل الطلب","اكمل الطلب","موافق اكمل","استمر بالطلب"]);
  const refundMention = hasAny(n,["استرداد","استرجاع","رجعولي","رجعلي فلوسي","الاسترداد تبعي","بدي فلوسي"]);

  if (stopRefund) add(isQuestion(raw)?"ask":"request_action","refund",0.995,isQuestion(raw)?"none":"stop_refund");
  else if (reopen) add(isQuestion(raw)?"ask":"request_action","reopen",0.995,isQuestion(raw)?"none":"reopen_application");
  else if (cancelMention) add(isQuestion(raw)?"ask":"request_action","cancellation",0.99,isQuestion(raw)?"none":"cancel_application");
  else if (continueMention) add(isQuestion(raw)?"ask":"request_action","continuation",0.98,isQuestion(raw)?"none":"continue_application");

  if (refundMention && !stopRefund) add(isQuestion(raw)?"ask":"request_action","refund",0.98,isQuestion(raw)?"none":"request_refund");

  if (hasAny(n,["حاله الطلب","حالة الطلب","شو صار بالطلب","وين طلبي","طلبي شو صار","معلومات الطلب","معلومات طلبي","شو معلومات الطلب","شو معلومات طلبي","تفاصيل الطلب","تفاصيل طلبي","شو تفاصيل الطلب","شو تفاصيل طلبي","بيانات الطلب","بيانات طلبي"])) add("ask","application_status",0.98);
  if (hasAny(n,["متى الموافقه","متى الموافقة","قديش بتقعد","كم بتقعد","متى بردولي خبر","مدة الدراسه","مدة الدراسة","قديش المراجعه","قديش المراجعة"])) add("ask","review_timing",0.98);
  if (hasAny(n,["ضغط المراجعات","ضغط المراجعه","ضغط شديد","ليش متاخر","ليش متأخر","التاخير","التأخير"])) add("ask","operational_pressure",0.88);
  if (hasAny(n,["وين موقعكم","وين المكتب","موقع الاستلام","العنوان"])) add("ask","office_location",0.99);
  if (hasAny(n,["موعد","احجز موعد","حجز موعد","اجي عالمكتب","اروح عالمكتب"])) add("ask","appointment",0.96);
  if (hasAny(n,["توصيل","كيف الاستلام","وين استلم","متى استلم"])) add("ask","delivery",0.97);

  if (hasAny(n,["5 دنانير","٥ دنانير","رسوم فتح الملف","الخمس دنانير"])) add("ask","payment_fee",0.99);
  if (hasAny(n,["متى ادفع","متى احول","متى الدفع","ادفع هسا","احول هسا"])) add("ask","payment_timing",0.98);
  if (hasAny(n,["لمين احول","اسم المستفيد","على مين احول","كليك"])) add("ask","payment_recipient",0.96);
  if (hasAny(n,["كيف ادفع","طريقه الدفع","طريقة الدفع"])) add("ask","payment_method",0.97);
  if (hasAny(n,["وصل الدفع","اثبات الدفع","إثبات الدفع","رفع الوصل","رابط الوصل","كيف ارفع الوصل"])) add("ask","receipt_upload",0.99,"generate_receipt_link");
  if (hasAny(n,["دفعت","حولت المبلغ","حولت الرسوم","تم الدفع","بعت الوصل","ارسلت الوصل","أرسلت الوصل"])) add("provide_fact","payment_confirmation",0.98,"generate_receipt_link","customer_claims_paid");

  if (hasAny(n,["الدفعة الاولى","الدفعه الاولى","القسط الاول","أول قسط"])) add("ask","first_installment",0.99);
  if (hasAny(n,["كم القسط","قيمة القسط","القسط الشهري"])) add("ask","installment_amount",0.95);
  if (hasAny(n,["كم شهر","مدة التقسيط","فتره التقسيط","فترة التقسيط"])) add("ask","installment_duration",0.95);

  if (hasAny(n,["كفيل","ضامن"])) add("ask","guarantor",0.95);
  if (hasAny(n,["شو المطلوب","المتطلبات","شو الاوراق","شو الأوراق","المستندات"])) add("ask","requirements",0.98);
  if (hasAny(n,["عدل بيانات","تعديل بيانات","الاسم غلط","الراتب غلط","رقمي غلط","تصحيح البيانات","غير رقمي","غير الراتب"])) add("request_action","application_correction",0.97,"change_application_data");
  if (hasAny(n,["غير الجهاز","تغيير الجهاز","بدي جهاز ثاني","بدل الجهاز","غير التلفون","غير الهاتف","بدل الموديل","غير الموديل"])) {
    add("request_action","device_change",0.98,"change_device",raw);
    add("ask","device_recalculation",0.93,"none",raw);
  }
  if (hasAny(n,["المنتجات","الاجهزه","الأجهزة","شو عندكم","ايفون","آيفون","سامسونج","honor","هونر","tecno","تكنو"])) add("ask","products",0.85);

  if (hasAny(n,["نصب","نصابين","احتيال","سرقتوا","ضحكتوا علي","حراميه","حرامية"])) add("complaint","complaint",0.99);
  if (hasAny(n,["محامي","شكوى رسميه","شكوى رسمية","قانون","المحكمه","المحكمة"])) add("complaint","legal",0.98);
  if (hasAny(n,["فيسبوك","انشر عليكم","رح انشر","افضحكم","فضيحه","فضيحة","سوشال","تشهير"])) add("complaint","social_threat",0.98);
  if (hasAny(n,["ثقه","موثوق","نصب ولا","كيف اضمن","شركة الامين للتمويل","الأمين للتمويل"])) add("ask","trust",0.95);
  if (hasAny(n,["الموقع","الويب سايت","website"])) add("ask","website",0.8);
  if (hasAny(n,["رقم التتبع","تتبع الطلب","رابط التتبع"])) add("ask","tracking",0.95);

  if (!pending.length) add(isQuestion(raw)?"ask":"unknown","unknown",0.45);

  const acts = pending.map((a,i) => ({ ...a, id: id(input.turnId,i) }));
  const topics = unique(acts.map((a) => a.topic));
  const requestedActions = unique(acts.map((a) => a.action || "none").filter((a) => a !== "none"));
  const angry = hasAny(n,["نصب","نصاب","محامي","افضح","تشهير","شكوى","حقير","كلب","حرامي"]);
  const frustrated = angry || hasAny(n,["زهقت","تعبت","ليش هيك","صارلي","تأخرتوا","تأخير","التاخير"]);
  const confused = hasAny(n,["ما فهمت","مش فاهم","كيف يعني","وضح"]);
  let explicitRoleRequest: InterpretedTurn["explicitRoleRequest"] = null;
  if (manager) explicitRoleRequest = "manager";
  else if (staff) explicitRoleRequest = "staff";
  else if (hasAny(n,["تالا"])) explicitRoleRequest = "tala";
  else if (hasAny(n,["فدوه","فدوة"])) explicitRoleRequest = "fadwa";
  else if (hasAny(n,["عبدالله"])) explicitRoleRequest = "abdullah";
  else if (hasAny(n,["عبدالرحمن"])) explicitRoleRequest = "abdulrahman";
  else if (hasAny(n,["عمران"])) explicitRoleRequest = "omran";

  return {
    turnId: input.turnId,
    rawText: raw,
    normalizedText: n,
    acts,
    topics,
    requestedActions,
    sentiment: angry ? "angry" : confused ? "confused" : frustrated ? "frustrated" : "calm",
    urgency: angry || topics.some((t) => ["legal","social_threat"].includes(t)) ? "urgent" : "normal",
    explicitRoleRequest,
    confidence: Math.max(...acts.map((a) => a.confidence)),
    warnings: [],
  };
}
