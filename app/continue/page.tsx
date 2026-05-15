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
      <main dir="rtl" className="min-h-screen bg-[#f7f1e7] px-4 py-10 text-[#213127]">
        <section className="mx-auto max-w-xl rounded-[28px] border border-red-200 bg-white p-6 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">
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
            className="mt-6 inline-flex rounded-2xl bg-[#143d2a] px-5 py-3 text-sm font-black text-white"
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

  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#f6efe3] px-4 py-6 text-[#1d2b22] sm:py-10">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(205,164,80,0.20),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(20,61,42,0.12),transparent_36%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.42),transparent_40%)]" />
      </div>

      <section className="relative mx-auto max-w-3xl">
        <div className="mb-4 rounded-[30px] border border-[#e1d2b8] bg-white/88 p-5 text-center shadow-[0_18px_60px_rgba(43,31,13,0.12)] backdrop-blur sm:p-7">
          <p className="mx-auto mb-3 inline-flex rounded-full border border-[#d8bd7a] bg-[#fff8e8] px-4 py-2 text-xs font-black text-[#8a6825]">
            الأمين للأقساط والتمويل
          </p>

          <h1 className="text-2xl font-black leading-10 text-[#143d2a] sm:text-3xl">
            تهانينا {customerName} 🎉
          </h1>

          <p className="mx-auto mt-3 max-w-2xl text-base font-black leading-8 text-[#2d4737]">
            تم تأهيل طلبكم مبدئيًا للانتقال إلى مرحلة الدراسة النهائية
          </p>

          <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#6a756c]">
            هذا يعني أن طلبكم اجتاز مرحلة المراجعة الأولية بنجاح، وهي مرحلة لا تصل إليها جميع الطلبات.
          </p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-[#eadcc5] bg-white/90 p-4 shadow-sm">
            <p className="text-xs font-black text-[#7b857e]">الجهاز المطلوب</p>
            <p className="mt-2 break-words text-sm font-black text-[#143d2a]">
              {app.device_name || "—"}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#eadcc5] bg-white/90 p-4 shadow-sm">
            <p className="text-xs font-black text-[#7b857e]">رقم التتبع</p>
            <p className="mt-2 break-words text-sm font-black text-[#143d2a]">
              {app.tracking_id || app.id}
            </p>
          </div>

          <div className="rounded-[24px] border border-[#b8ddc4] bg-[#edf9f0] p-4 shadow-sm">
            <p className="text-xs font-black text-[#5f7565]">الحالة الحالية</p>
            <p className="mt-2 text-sm font-black text-[#14723a]">
              مؤهل مبدئيًا
            </p>
          </div>
        </div>

        {isConfirmed ? (
          <div className="rounded-[30px] border border-[#b8ddc4] bg-white p-5 shadow-[0_18px_60px_rgba(43,31,13,0.10)] sm:p-7">
            <div className="rounded-[26px] bg-[#edf9f0] p-5">
              <h2 className="text-2xl font-black text-[#14723a]">
                تم تأكيد رغبتكم بالاستمرار ✅
              </h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[#526158]">
                تم تسجيل موافقتكم داخل النظام. يمكنكم الآن إرسال تأكيد عبر واتساب، ثم متابعة تعليمات الدفع لاستكمال فتح الملف.
              </p>
            </div>

            <div className="mt-5 rounded-[26px] border border-[#e2c984] bg-[#fff8e8] p-5">
              <h3 className="text-lg font-black text-[#7c5b13]">
                معلومات رسوم فتح الملف
              </h3>
              <div className="mt-4 space-y-2 text-sm font-black leading-7 text-[#2f362f]">
                <p>قيمة الرسوم: 5 دنانير فقط</p>
                <p>اسم المستفيد: AMEENPAY</p>
                <p>اسم المحفظة: Orang-Money</p>
                <p>الاسم: ABDUL RAHMAN ALHARAHSHEH</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center rounded-2xl bg-[#25D366] px-5 py-4 text-center text-sm font-black text-[#062b13] shadow-lg transition hover:opacity-90"
              >
                إرسال تأكيد الاستمرار عبر واتساب
              </a>

              <a
                href={trackUrl}
                className="flex items-center justify-center rounded-2xl border border-[#d9c49b] bg-white px-5 py-4 text-center text-sm font-black text-[#143d2a] shadow-sm transition hover:bg-[#fbf7ef]"
              >
                متابعة حالة الطلب
              </a>
            </div>
          </div>
        ) : isDeclined ? (
          <div className="rounded-[30px] border border-[#efd0d0] bg-white p-5 shadow-[0_18px_60px_rgba(43,31,13,0.10)] sm:p-7">
            <h2 className="text-2xl font-black text-[#9d2f2f]">
              تم تسجيل عدم الرغبة بالاستمرار
            </h2>
            <p className="mt-3 text-sm font-bold leading-7 text-[#6a5d5d]">
              تم تحديث حالة الطلب بناءً على اختياركم. يمكنكم التواصل معنا لاحقًا في حال الرغبة بإعادة فتح الطلب أو تقديم طلب جديد.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-[30px] border border-[#d8bd7a] bg-white p-5 shadow-[0_18px_60px_rgba(43,31,13,0.12)] sm:p-7">
              <div className="mb-5 rounded-[26px] bg-[#f7fbf3] p-5 text-center">
                <h2 className="text-xl font-black text-[#143d2a]">
                  قرار الاستمرار
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#627064]">
                  عند الضغط على زر الاستمرار، سيتم تسجيل رغبتكم رسميًا داخل النظام وتحويل الطلب لاستكمال فتح الملف.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <form action="/api/continue-decision" method="POST" className="order-1 sm:order-none">
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
                      لقد قرأت تفاصيل المرحلة القادمة وفهمت أن رسوم فتح الملف 5 دنانير وهي مستردة في حال عدم الموافقة.
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]"
                  >
                    نعم، أريد الاستمرار وفتح الملف
                  </button>
                </form>

                <form action="/api/continue-decision" method="POST" className="order-2 sm:order-none">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                  <input type="hidden" name="phone" value={app.phone || ""} />
                  <input type="hidden" name="decision" value="declined" />
                  <button
                    type="submit"
                    className="mt-[76px] w-full rounded-2xl border border-[#d7d0c4] bg-[#fbf8f2] px-5 py-4 text-sm font-black text-[#5d675f] transition hover:bg-white max-sm:mt-0"
                  >
                    لا، لا أرغب بالاستمرار حاليًا
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-[28px] border border-[#eadcc5] bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-black text-[#143d2a]">
                  ماذا يعني التأهيل المبدئي؟
                </h2>
                <p className="mt-3 text-sm font-bold leading-8 text-[#5e6b62]">
                  هذا يعني أن الطلب مستوفي للشروط الأساسية المطلوبة مبدئيًا، وسيتم تحويله لقسم الدراسة النهائية بعد فتح الملف.
                </p>
                <p className="mt-3 text-sm font-bold leading-8 text-[#5e6b62]">
                  مهم جدًا: هذه المرحلة لا تعني الموافقة النهائية بعد، لكنها تعني أن الطلب اجتاز مرحلة الفرز الأولي بنجاح.
                </p>
              </div>

              <div className="rounded-[28px] border border-[#e2c984] bg-[#fff8e8] p-5 shadow-sm">
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

              <div className="rounded-[28px] border border-[#d4e2da] bg-white/90 p-5 shadow-sm">
                <h2 className="text-lg font-black text-[#143d2a]">
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
