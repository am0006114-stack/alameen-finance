import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ApplicationRecord = {
  id: string;
  created_at?: string | null;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  status?: string | null;
  payment_status?: string | null;
  device_name?: string | null;
  monthly_payment?: number | string | null;
  installment_months?: number | string | null;
  delivery_delay_until?: string | null;
};

function getBaseUrl(request: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

function normalizePhone(value: string | null | undefined) {
  return String(value || "").trim().replace(/\D/g, "");
}

function normalizeJordanPhone(value: string | null | undefined) {
  const digits = normalizePhone(value);

  if (!digits) return "";

  if (digits.startsWith("962") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }

  if (digits.startsWith("7") && digits.length === 9) {
    return `0${digits}`;
  }

  return digits;
}

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[1]}`;
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) return String(value);

  return `${numberValue.toFixed(2)} د.أ`;
}

function formatJordanDateTime(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("ar-JO", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Amman",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function translatePaymentStatus(status: string | null | undefined) {
  switch (status) {
    case "not_requested_yet":
      return "لم يُطلب الدفع بعد";
    case "not_paid":
      return "لم يتم الدفع";
    case "pending":
    case "pending_payment":
      return "بانتظار استكمال خطوة الدفع";
    case "payment_info_sent":
      return "تم إرسال معلومات الدفع";
    case "customer_claimed_paid":
      return "تم إرسال إشعار الدفع بانتظار تأكيد الإدارة";
    case "confirmed":
      return "تم تأكيد رسوم فتح الملف";
    case "rejected":
      return "الدفع غير مؤكد";
    case "refund_requested":
      return "تم تسجيل طلب استرداد الرسوم";
    default:
      return "غير مطلوب حالياً";
  }
}

function getSafeStatus(app: ApplicationRecord, baseUrl: string) {
  const tracking = app.tracking_id || app.id;
  const phone = app.phone || "";
  const trackingUrl = `${baseUrl}/track?phone=${encodeURIComponent(
    phone
  )}&tracking=${encodeURIComponent(tracking)}`;

  const delayDecisionUrl = `${baseUrl}/delay-decision?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;

  const receiptUploadUrl = `${baseUrl}/receipt?tracking=${encodeURIComponent(
    tracking
  )}&phone=${encodeURIComponent(phone)}`;

  const delayUntilText = formatJordanDateTime(app.delivery_delay_until);
  const paymentText = translatePaymentStatus(app.payment_status);

  if (app.payment_status === "customer_claimed_paid") {
    return {
      statusText: "وصل الدفع قيد التأكيد",
      paymentText,
      actionType: "wait_payment_confirmation",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "تم تسجيل إشعار الدفع أو الوصل، والطلب الآن بانتظار مراجعة الإدارة. لا تقم بإعادة الدفع، وسيتم تحديث الحالة فور التأكد.",
    };
  }

  if (app.payment_status === "confirmed" && app.status === "under_review") {
    return {
      statusText: "قيد الدراسة النهائية",
      paymentText,
      actionType: "under_final_review",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "تم تأكيد رسوم فتح الملف، وطلبك الآن قيد الدراسة النهائية. سيتم التواصل معك عند صدور التحديث أو في حال الحاجة لأي معلومات إضافية.",
    };
  }

  if (app.status === "preliminary_qualified") {
    return {
      statusText: "مؤهل مبدئياً",
      paymentText,
      actionType: "ask_file_opening_fee",
      canAskPayment: true,
      shouldEscalateToHuman: false,
      actionUrl: receiptUploadUrl,
      customerMessage:
        "طلبك مؤهل مبدئياً للانتقال إلى مرحلة الدراسة النهائية. للاستمرار، يلزم دفع رسوم فتح الملف بقيمة 5 دنانير فقط. الرسوم مستردة بالكامل في حال عدم الموافقة، والقسط الأول لا يُدفع الآن بل بعد الاستلام حسب الاتفاق.",
      paymentInstruction:
        "اطلب من العميل دفع رسوم فتح الملف 5 دنانير فقط، ثم إرسال أو رفع وصل الدفع. لا تطلب القسط الأول الآن.",
    };
  }

  if (app.status === "customer_confirmed_continue") {
    return {
      statusText: "العميل وافق على الاستمرار",
      paymentText,
      actionType: "send_payment_info",
      canAskPayment: true,
      shouldEscalateToHuman: false,
      actionUrl: receiptUploadUrl,
      customerMessage:
        "تم تسجيل رغبتك بالاستمرار. لاستكمال فتح الملف وتحويل الطلب للدراسة النهائية، يرجى دفع رسوم فتح الملف بقيمة 5 دنانير فقط. الرسوم مستردة بالكامل في حال عدم الموافقة، والقسط الأول لا يُدفع الآن بل بعد الاستلام حسب الاتفاق.",
      paymentInstruction:
        "يمكن إرسال معلومات دفع رسوم فتح الملف 5 دنانير ورابط رفع الوصل. لا تطلب القسط الأول.",
    };
  }

  if (
    app.payment_status === "pending" ||
    app.payment_status === "pending_payment" ||
    app.payment_status === "payment_info_sent"
  ) {
    return {
      statusText: "بانتظار استكمال رسوم فتح الملف",
      paymentText,
      actionType: "send_payment_info",
      canAskPayment: true,
      shouldEscalateToHuman: false,
      actionUrl: receiptUploadUrl,
      customerMessage:
        "طلبك بانتظار استكمال رسوم فتح الملف بقيمة 5 دنانير فقط. الرسوم مستردة بالكامل في حال عدم الموافقة. بعد الدفع يرجى رفع أو إرسال وصل الدفع حتى يتم تحويل الطلب للدراسة النهائية.",
      paymentInstruction:
        "يمكن تذكير العميل برسوم فتح الملف 5 دنانير فقط ورابط رفع الوصل. لا تطلب القسط الأول.",
    };
  }

  if (app.status === "delivery_delay_notice_sent") {
    return {
      statusText: "تم إرسال خيار التمديد أو الاسترداد",
      paymentText,
      actionType: "delay_decision_required",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: delayDecisionUrl,
      customerMessage:
        "تم إرسال خيار التمديد أو الاسترداد لطلبك. يمكنك اختيار الانتظار حتى الموعد الجديد أو طلب استرداد رسوم فتح الملف من الرابط المخصص.",
      delayUntilText,
    };
  }

  if (app.status === "customer_accepts_delivery_delay") {
    return {
      statusText: "تم اختيار الانتظار حتى الموعد الجديد",
      paymentText,
      actionType: "delay_accepted",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage: delayUntilText
        ? `تم تسجيل اختيارك بالانتظار. الموعد الجديد المعتمد هو: ${delayUntilText}. سيتم استكمال الطلب حسب الدور.`
        : "تم تسجيل اختيارك بالانتظار. سيتم استكمال الطلب حسب الموعد الجديد المعتمد وحسب الدور.",
      delayUntilText,
    };
  }

  if (app.status === "refund_requested" || app.payment_status === "refund_requested") {
    return {
      statusText: "تم تسجيل طلب استرداد رسوم فتح الملف",
      paymentText: "طلب استرداد الرسوم مسجل",
      actionType: "refund_requested",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "تم تسجيل طلب استرداد رسوم فتح الملف. سيتم مراجعة بيانات التحويل وتنفيذ الاسترداد حسب ترتيب الطلبات.",
    };
  }

  if (app.status === "refund_completed") {
    return {
      statusText: "تم تنفيذ الاسترداد",
      paymentText: "تم تنفيذ الاسترداد",
      actionType: "refund_completed",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "تم تنفيذ استرداد رسوم فتح الملف حسب البيانات المسجلة لدينا. في حال وجود أي ملاحظة يرجى إرسال رقم التتبع ورقم الهاتف.",
    };
  }

  if (app.status === "needs_salary_slip") {
    return {
      statusText: "بحاجة كشف راتب",
      paymentText,
      actionType: "needs_salary_slip",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "نحتاج كشف راتب أو شهادة راتب حديثة لاستكمال دراسة الطلب. إرسال المستند لا يعني الموافقة النهائية وإنما لاستكمال الدراسة.",
    };
  }

  if (app.status === "needs_guarantor") {
    return {
      statusText: "بحاجة كفيل",
      paymentText,
      actionType: "needs_guarantor",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "نحتاج إدخال بيانات كفيل لاستكمال دراسة الملف. طلب الكفيل لا يعني رفض الطلب، وإنما إجراء لاستكمال الدراسة حسب سياسة الموافقة.",
    };
  }

  if (app.status === "guarantor_submitted") {
    return {
      statusText: "تم استلام بيانات الكفيل",
      paymentText,
      actionType: "guarantor_submitted",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "تم استلام بيانات الكفيل وربطها بطلبك. الطلب الآن بانتظار متابعة الإدارة للخطوة التالية.",
    };
  }

  if (app.status === "under_review") {
    return {
      statusText: "قيد الدراسة",
      paymentText,
      actionType: "under_review",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "طلبك قيد الدراسة حالياً. سيتم التواصل معك عند صدور القرار أو في حال الحاجة لأي معلومات إضافية.",
    };
  }

  if (app.status === "approved") {
    return {
      statusText: "مقبول / بانتظار استكمال الإجراءات النهائية",
      paymentText,
      actionType: "approved",
      canAskPayment: false,
      shouldEscalateToHuman: true,
      actionUrl: trackingUrl,
      customerMessage:
        "تمت الموافقة على طلبك. سيتم التواصل معك لاستكمال الإجراءات النهائية وتحديد موعد الاستلام من الإدارة. لا يمكن للرد الآلي تحديد موعد تسليم جديد من نفسه.",
    };
  }

  if (app.status === "rejected") {
    return {
      statusText: "لم تتم الموافقة حالياً",
      paymentText,
      actionType: "rejected",
      canAskPayment: false,
      shouldEscalateToHuman: true,
      actionUrl: trackingUrl,
      customerMessage:
        "نعتذر، لم تتم الموافقة على الطلب حالياً. للاستفسار عن التفاصيل العامة أو إمكانية إعادة التقديم لاحقاً، يرجى متابعة الموظف المختص.",
    };
  }

  if (app.status === "cancelled") {
    return {
      statusText: "الطلب ملغي",
      paymentText,
      actionType: "cancelled",
      canAskPayment: false,
      shouldEscalateToHuman: true,
      actionUrl: trackingUrl,
      customerMessage:
        "هذا الطلب ظاهر لدينا كطلب ملغي. إذا كان الإلغاء بالخطأ، يرجى إرسال رقم التتبع ورقم الهاتف ليتم تحويله للمتابعة.",
    };
  }

  if (app.status === "preliminary_application" || app.status === "submitted" || !app.status) {
    return {
      statusText: "طلبك وصل للإدارة",
      paymentText,
      actionType: "received",
      canAskPayment: false,
      shouldEscalateToHuman: false,
      actionUrl: trackingUrl,
      customerMessage:
        "تم استلام طلبك كمراجعة مبدئية. إذا احتجنا أي معلومة إضافية سيتم التواصل معك عبر واتساب. لا يوجد أي دفع مطلوب حالياً.",
    };
  }

  return {
    statusText: "قيد المتابعة",
    paymentText,
    actionType: "general_follow_up",
    canAskPayment: false,
    shouldEscalateToHuman: false,
    actionUrl: trackingUrl,
    customerMessage:
      "طلبك قيد المتابعة. يرجى متابعة الحالة لاحقاً أو انتظار التواصل عبر واتساب.",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = getBaseUrl(request);

  const tracking = String(url.searchParams.get("tracking") || "").trim();
  const phoneRaw = String(url.searchParams.get("phone") || "").trim();
  const phone = normalizeJordanPhone(phoneRaw);

  if (!tracking || !phone) {
    return NextResponse.json(
      {
        found: false,
        error: "MISSING_REQUIRED_FIELDS",
        message: "يرجى إرسال رقم التتبع ورقم الهاتف المستخدم في الطلب.",
      },
      { status: 400 }
    );
  }

  if (!/^07[789]\d{7}$/.test(phone)) {
    return NextResponse.json(
      {
        found: false,
        error: "INVALID_PHONE",
        message:
          "رقم الهاتف غير صحيح. يجب أن يبدأ بـ 079 أو 078 أو 077 ويتكون من 10 أرقام.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("applications")
    .select(
      `
      id,
      created_at,
      tracking_id,
      full_name,
      phone,
      status,
      payment_status,
      device_name,
      monthly_payment,
      installment_months,
      delivery_delay_until
    `
    )
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        found: false,
        error: "SUPABASE_ERROR",
        message: "حدث خطأ أثناء فحص الطلب. يرجى المحاولة لاحقاً.",
      },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        found: false,
        error: "ORDER_NOT_FOUND",
        message:
          "لم يتم العثور على طلب مطابق. يرجى التأكد من رقم الهاتف ورقم التتبع.",
      },
      { status: 404 }
    );
  }

  const app = data as ApplicationRecord;
  const safeStatus = getSafeStatus(app, baseUrl);
  const trackingId = app.tracking_id || app.id;
  const trackingUrl = `${baseUrl}/track?phone=${encodeURIComponent(
    app.phone || phone
  )}&tracking=${encodeURIComponent(trackingId)}`;

  return NextResponse.json({
    found: true,
    customerName: firstTwoNames(app.full_name),
    trackingId,
    phone: app.phone || phone,
    deviceName: app.device_name || null,
    installmentMonths: app.installment_months || null,
    monthlyPayment: formatMoney(app.monthly_payment),
    status: app.status || null,
    paymentStatus: app.payment_status || null,
    statusText: safeStatus.statusText,
    paymentText: safeStatus.paymentText,
    actionType: safeStatus.actionType,
    canAskPayment: safeStatus.canAskPayment,
    shouldEscalateToHuman: safeStatus.shouldEscalateToHuman,
    actionUrl: safeStatus.actionUrl,
    trackingUrl,
    delayUntilText: "delayUntilText" in safeStatus ? safeStatus.delayUntilText : null,
    customerMessage: safeStatus.customerMessage,
    paymentInstruction:
      "paymentInstruction" in safeStatus ? safeStatus.paymentInstruction : null,
    safetyRules: {
      doNotAskFirstInstallmentNow: true,
      fileOpeningFeeAmount: "5 دنانير",
      fileOpeningFeeRefundableIfNotApproved: true,
      doNotConfirmFinalApprovalUnlessStatusApproved: true,
      doNotSetDeliveryDateAutomatically: true,
      doNotExposeSensitiveData: true,
    },
  });
}
