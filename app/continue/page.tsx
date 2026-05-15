import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  searchParams?: Promise<{
    tracking?: string;
    phone?: string;
    decision?: string;
  }>;
};

type ApplicationRecord = {
  id: string;
  tracking_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  device_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
};

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function normalizeJordanPhoneForWhatsApp(phone: string | null | undefined) {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("962")) return digits;

  if (digits.startsWith("07") && digits.length === 10) {
    return `962${digits.slice(1)}`;
  }

  if (digits.startsWith("7") && digits.length === 9) {
    return `962${digits}`;
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

function buildTrackUrl(app: ApplicationRecord) {
  const baseUrl = getBaseUrl();
  const phone = app.phone || "";
  const tracking = app.tracking_id || app.id || "";

  return `${baseUrl}/track?phone=${encodeURIComponent(
    phone
  )}&tracking=${encodeURIComponent(tracking)}`;
}

function makeWhatsAppUrl(app: ApplicationRecord) {
  const cleanPhone = normalizeJordanPhoneForWhatsApp("0788500337");
  const tracking = app.tracking_id || app.id;
  const name = firstTwoNames(app.full_name);

  const message = `نعم، أود الاستمرار بإجراءات فتح الملف وتحويل طلبي للدراسة النهائية.

رقم التتبع: ${tracking}
الاسم: ${name}`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

function pageTone(isConfirmed: boolean, isDeclined: boolean) {
  if (isConfirmed) {
    return {
      eyebrow: "تم تأكيد الاستمرار",
      title: "تم تسجيل رغبتكم بالاستمرار",
      icon: "✅",
      subtitle:
        "تم تسجيل اختياركم داخل النظام، ويمكنكم الآن متابعة تعليمات فتح الملف واستكمال إجراءات الدراسة النهائية.",
      statusText: "تم تأكيد الاستمرار",
      statusClass: "border-[#b8ddc4] bg-[#edf9f0] text-[#14723a]",
      heroRing: "border-[#b8ddc4]",
    };
  }

  if (isDeclined) {
    return {
      eyebrow: "تم تسجيل الاختيار",
      title: "تم تسجيل عدم الرغبة بالاستمرار",
      icon: "تم",
      subtitle:
        "تم تحديث حالة الطلب بناءً على اختياركم. يمكنكم التواصل معنا لاحقًا في حال الرغبة بإعادة فتح الطلب أو تقديم طلب جديد.",
      statusText: "لا يرغب بالاستمرار حاليًا",
      statusClass: "border-[#efd0d0] bg-[#fff5f4] text-[#9d2f2f]",
      heroRing: "border-[#efd0d0]",
    };
  }

  return {
    eyebrow: "نتيجة المراجعة الأولية",
    title: "تهانينا، تم تأهيل طلبكم مبدئيًا",
    icon: "🎉",
    subtitle:
      "طلبكم اجتاز مرحلة المراجعة الأولية بنجاح، وهي مرحلة لا تصل إليها جميع الطلبات.",
    statusText: "مؤهل مبدئيًا",
    statusClass: "border-[#b8ddc4] bg-[#edf9f0] text-[#14723a]",
    heroRing: "border-[#e0c27a]",
  };
}

export default async function ContinueDecisionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tracking = String(params?.tracking || "").trim();
  const phone = String(params?.phone || "").trim();
  const decision = String(params?.decision || "").trim();

  if (!tracking || !phone) {
    redirect("/");
  }

  const { data: application, error } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, status, payment_status")
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (error || !application) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f5efe4] px-4 py-10 text-[#1b2b22]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-[0_24px_80px_rgba(60,45,20,0.14)]">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-2xl font-black text-red-700">
            !
          </div>
          <h1 className="text-2xl font-black text-red-700">
            لم يتم العثور على الطلب
          </h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">
            يرجى التأكد من فتح الرابط الصحيح المرسل من فريق الأمين للأقساط والتمويل، أو التواصل معنا عبر واتساب للمساعدة.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl bg-[#123725] px-5 py-3 text-sm font-black text-white"
          >
            الرجوع للرئيسية
          </Link>
        </section>
      </main>
    );
  }

  const app = application as ApplicationRecord;
  const customerName = firstTwoNames(app.full_name);
  const trackUrl = buildTrackUrl(app);
  const whatsappUrl = makeWhatsAppUrl(app);

  const isConfirmed =
    decision === "confirmed" || app.status === "customer_confirmed_continue";
  const isDeclined =
    decision === "declined" || app.status === "customer_declined_continue";
  const tone = pageTone(isConfirmed, isDeclined);

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden bg-[#f4ecdd] px-4 py-6 text-[#17261d] sm:py-10">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,176,95,0.30),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(17,58,37,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f5ecdc_45%,#e8dcc6_100%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(135deg,rgba(130,92,30,0.35)_1px,transparent_1px),linear-gradient(45deg,rgba(130,92,30,0.22)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <section className="relative mx-auto max-w-4xl">
        <div className={`rounded-[36px] border ${tone.heroRing} bg-white/92 p-[1px] shadow-[0_30px_100px_rgba(59,43,18,0.18)] backdrop-blur`}>
          <div className="rounded-[35px] bg-[linear-gradient(180deg,#ffffff_0%,#fffdf8_55%,#fbf5eb_100%)] p-6 text-center sm:p-9">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#dec27d] bg-[linear-gradient(135deg,#fff8df,#f1d68e,#fffaf0)] text-3xl shadow-[0_16px_35px_rgba(156,114,35,0.20)]">
              {tone.icon}
            </div>

            <p className="mx-auto mb-4 inline-flex rounded-full border border-[#d8bd7a] bg-[#fff8e8] px-5 py-2 text-xs font-black text-[#876420]">
              {tone.eyebrow}
            </p>

            <h1 className="text-3xl font-black leading-[1.7] text-[#123725] sm:text-4xl">
              {isDeclined ? tone.title : `${tone.title} ${customerName}`}
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-base font-bold leading-8 text-[#5e6b62]">
              {tone.subtitle}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[28px] border border-[#eadcc5] bg-white/92 p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#818981]">الجهاز المطلوب</p>
            <p className="mt-2 break-words text-base font-black leading-7 text-[#123725]">
              {app.device_name || "—"}
            </p>
          </div>

          <div className="rounded-[28px] border border-[#eadcc5] bg-white/92 p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#818981]">رقم التتبع</p>
            <p className="mt-2 break-words text-lg font-black text-[#123725]">
              {app.tracking_id || app.id}
            </p>
          </div>

          <div className={`rounded-[28px] border p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)] ${tone.statusClass}`}>
            <p className="text-xs font-black opacity-75">الحالة الحالية</p>
            <p className="mt-2 text-base font-black">
              {tone.statusText}
            </p>
          </div>
        </div>

        {isConfirmed ? (
          <div className="mt-5 rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
            <div className="rounded-[28px] border border-[#b8ddc4] bg-[#edf9f0] p-5">
              <h2 className="text-2xl font-black text-[#14723a]">
                تم تأكيد رغبتكم بالاستمرار ✅
              </h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[#526158]">
                تم تسجيل موافقتكم داخل النظام. يمكنكم الآن إرسال تأكيد عبر واتساب ومتابعة تعليمات الدفع لاستكمال فتح الملف.
              </p>
            </div>

            <div className="mt-5 rounded-[28px] border border-[#d8bd7a] bg-[#fff8e8] p-5 text-center">
              <h3 className="text-lg font-black text-[#7c5b13]">
                تم تحويلكم إلى واتساب لاستكمال الخطوة التالية
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#594c2c]">
                حفاظًا على وضوح الإجراءات، تظهر معلومات الدفع فقط داخل رسالة واتساب الرسمية بعد تأكيد الاستمرار.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center rounded-2xl bg-[#25D366] px-5 py-4 text-center text-sm font-black text-[#062b13] shadow-lg transition hover:opacity-90"
              >
                فتح واتساب لمتابعة الدفع
              </a>

              <a
                href={trackUrl}
                className="flex items-center justify-center rounded-2xl border border-[#d9c49b] bg-white px-5 py-4 text-center text-sm font-black text-[#123725] shadow-sm transition hover:bg-[#fbf7ef]"
              >
                متابعة حالة الطلب
              </a>
            </div>
          </div>
        ) : isDeclined ? (
          <div className="mt-5 rounded-[34px] border border-[#efd0d0] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.12)] sm:p-8">
            <div className="rounded-[28px] border border-[#efd0d0] bg-[#fff5f4] p-5 text-center">
              <h2 className="text-2xl font-black text-[#9d2f2f]">
                تم تسجيل اختياركم بنجاح
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#6a5d5d]">
                تم إيقاف متابعة هذا الطلب بناءً على اختياركم. في حال رغبتم بالاستمرار لاحقًا، يمكنكم التواصل معنا لإعادة فتح الطلب أو تقديم طلب جديد.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href="https://wa.me/962788500337"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center rounded-2xl bg-[#123725] px-5 py-4 text-center text-sm font-black text-white shadow-lg transition hover:opacity-90"
              >
                التواصل معنا لإعادة فتح الطلب
              </a>

              <Link
                href="/"
                className="flex items-center justify-center rounded-2xl border border-[#d9c49b] bg-white px-5 py-4 text-center text-sm font-black text-[#123725] shadow-sm transition hover:bg-[#fbf7ef]"
              >
                الرجوع للرئيسية
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
              <div className="mb-5 rounded-[28px] border border-[#e7d8bd] bg-[#fffaf1] p-5 text-center">
                <h2 className="text-2xl font-black text-[#123725]">
                  تأكيد الرغبة بالاستمرار
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#627064]">
                  عند الضغط على زر الاستمرار، سيتم تسجيل رغبتكم رسميًا داخل النظام وتحويل الطلب لاستكمال فتح الملف.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <form action="/api/continue-decision" method="POST">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                  <input type="hidden" name="phone" value={app.phone || ""} />
                  <input type="hidden" name="decision" value="confirmed" />

                  <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#d7e9d9] bg-[#f1fbf3] p-4 text-right">
                    <input
                      required
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-[#169447]"
                    />
                    <span className="text-sm font-black leading-7 text-[#2b4934]">
                      لقد قرأت تفاصيل المرحلة القادمة وفهمت أن رسوم فتح الملف 5 دنانير وهي مستردة بالكامل في حال عدم الموافقة.
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]"
                  >
                    نعم، أريد الاستمرار وفتح الملف
                  </button>
                </form>

                <form action="/api/continue-decision" method="POST">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                  <input type="hidden" name="phone" value={app.phone || ""} />
                  <input type="hidden" name="decision" value="declined" />

                  <div className="mb-3 rounded-2xl border border-[#efcaca] bg-[#fff5f4] p-4 text-sm font-bold leading-7 text-[#8f3a35]">
                    اختيار عدم الاستمرار سيوقف متابعة هذا الطلب حاليًا فقط، ويمكنكم التواصل معنا لاحقًا لإعادة فتح الطلب.
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-2xl border border-[#d95b50] bg-[#b83a32] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#a8322b]"
                  >
                    لا، لا أرغب بالاستمرار حاليًا
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-[24px] border border-[#eadcc5] bg-white/70 p-4 shadow-sm">
                <h2 className="text-sm font-black text-[#6b745f]">
                  ملاحظة توضيحية: ماذا يعني التأهيل المبدئي؟
                </h2>
                <p className="mt-2 text-xs font-bold leading-7 text-[#7a837c]">
                  التأهيل المبدئي يعني أن الطلب مستوفي للشروط الأساسية المطلوبة مبدئيًا وقابل للانتقال إلى قسم الدراسة النهائية بعد فتح الملف.
                </p>
                <p className="mt-2 text-xs font-bold leading-7 text-[#7a837c]">
                  هذه المرحلة لا تعني الموافقة النهائية، لكنها تعني أن الطلب اجتاز مرحلة الفرز الأولي بنجاح.
                </p>
              </div>

              <div className="rounded-[30px] border border-[#e2c984] bg-[#fff8e8] p-5 shadow-sm">
                <h2 className="text-lg font-black text-[#7c5b13]">
                  رسوم فتح الملف: 5 دنانير فقط
                </h2>
                <p className="mt-3 text-sm font-bold leading-8 text-[#594c2c]">
                  رسوم فتح الملف هدفها تأكيد جدية الطلب، فتح ملف دراسة رسمي باسمكم، وتحويل الطلب للقسم المختص بدل بقائه كطلب مبدئي فقط.
                </p>

                <div className="mt-4 rounded-2xl border border-[#b8ddc4] bg-[#edf9f0] p-4 text-sm font-black leading-8 text-[#14723a]">
                  <p>✅ الرسوم مستردة بالكامل في حال عدم الموافقة.</p>
                  <p>✅ وفي حال إتمام العقد والاستلام، يتم احتسابها ضمن إجراءات الملف.</p>
                </div>
              </div>

              <div className="rounded-[30px] border border-[#d4e2da] bg-white/92 p-5 shadow-sm">
                <h2 className="text-lg font-black text-[#123725]">
                  ماذا يحدث بعد التأكيد؟
                </h2>
                <ol className="mt-3 list-inside list-decimal space-y-2 text-sm font-bold leading-7 text-[#5e6b62]">
                  <li>يتم تسجيل رغبتكم بالاستمرار داخل النظام.</li>
                  <li>يتم فتح ملف رسمي للطلب.</li>
                  <li>يتم تحويل الطلب إلى قسم الدراسة النهائية.</li>
                  <li>يتم الرد خلال 24 إلى 72 ساعة حسب ضغط الطلبات.</li>
                </ol>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
