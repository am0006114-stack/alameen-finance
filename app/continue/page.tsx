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
      <main dir="rtl" className="min-h-screen px-4 py-10 text-[#f7f3e8]">
        <section className="mx-auto max-w-2xl rounded-[32px] border border-red-400/30 bg-red-950/25 p-6 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-100">
            لم يتم العثور على الطلب
          </h1>
          <p className="mt-4 text-sm font-bold leading-7 text-red-100/90">
            يرجى التأكد من فتح الرابط الصحيح المرسل من فريق الأمين للأقساط والتمويل، أو التواصل معنا عبر واتساب للمساعدة.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white"
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
    <main dir="rtl" className="relative min-h-screen overflow-hidden px-4 py-8 text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[330px] w-[330px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-130px] top-[300px] h-[330px] w-[330px] rounded-full bg-[#3fae65]/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-3xl rounded-[34px] border border-[rgba(214,181,107,0.18)] bg-[rgba(3,18,14,0.86)] p-1 shadow-2xl">
        <div className="rounded-[32px] border border-[rgba(214,181,107,0.12)] p-5 sm:p-8">
          <div className="mb-6 text-center">
            <p className="mx-auto mb-4 inline-flex rounded-full border border-[rgba(214,181,107,0.30)] bg-[rgba(214,181,107,0.10)] px-4 py-2 text-xs font-black text-[#f3dfac]">
              الأمين للأقساط والتمويل
            </p>

            <h1 className="text-2xl font-black leading-10 text-white sm:text-3xl">
              تهانينا {customerName}، تم تأهيل طلبكم مبدئيًا ✅
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-sm font-bold leading-7 text-[#cbd6cb]">
              طلبكم اجتاز مرحلة المراجعة الأولية بنجاح، وتم اعتباره مؤهلًا للانتقال إلى مرحلة الدراسة النهائية.
            </p>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.04)] p-4">
              <p className="text-xs font-bold text-[#aeb9af]">الجهاز المطلوب</p>
              <p className="mt-2 break-words text-sm font-black text-white">
                {app.device_name || "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.04)] p-4">
              <p className="text-xs font-bold text-[#aeb9af]">رقم التتبع</p>
              <p className="mt-2 break-words text-sm font-black text-white">
                {app.tracking_id || app.id}
              </p>
            </div>

            <div className="rounded-2xl border border-[rgba(105,217,123,0.26)] bg-[rgba(105,217,123,0.08)] p-4">
              <p className="text-xs font-bold text-[#aeb9af]">الحالة الحالية</p>
              <p className="mt-2 text-sm font-black text-[#b8f3c0]">
                مؤهل مبدئيًا
              </p>
            </div>
          </div>

          {isConfirmed ? (
            <div className="rounded-[28px] border border-[rgba(105,217,123,0.30)] bg-[rgba(105,217,123,0.08)] p-5">
              <h2 className="text-xl font-black text-[#b8f3c0]">
                تم تأكيد رغبتكم بالاستمرار ✅
              </h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[#d7ddd5]">
                تم تسجيل موافقتكم داخل النظام، وسيتم متابعة الطلب لاستكمال فتح الملف وتحويله للدراسة النهائية.
              </p>

              <div className="mt-5 rounded-2xl border border-[rgba(214,181,107,0.22)] bg-[rgba(214,181,107,0.08)] p-4">
                <h3 className="text-base font-black text-[#f3dfac]">
                  معلومات رسوم فتح الملف
                </h3>
                <div className="mt-3 space-y-2 text-sm font-bold leading-7 text-[#f7f3e8]">
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
                  className="flex items-center justify-center rounded-2xl bg-[#25D366] px-5 py-4 text-center text-sm font-black text-[#062b13] transition hover:opacity-90"
                >
                  إرسال تأكيد الاستمرار عبر واتساب
                </a>

                <a
                  href={trackUrl}
                  className="flex items-center justify-center rounded-2xl border border-[rgba(214,181,107,0.28)] bg-[rgba(255,255,255,0.05)] px-5 py-4 text-center text-sm font-black text-white transition hover:bg-[rgba(255,255,255,0.09)]"
                >
                  متابعة حالة الطلب
                </a>
              </div>
            </div>
          ) : isDeclined ? (
            <div className="rounded-[28px] border border-red-400/30 bg-red-950/20 p-5">
              <h2 className="text-xl font-black text-red-100">
                تم تسجيل عدم الرغبة بالاستمرار
              </h2>
              <p className="mt-3 text-sm font-bold leading-7 text-red-100/90">
                تم تحديث حالة الطلب بناءً على اختياركم. يمكنكم التواصل معنا لاحقًا في حال الرغبة بإعادة فتح الطلب أو تقديم طلب جديد.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="rounded-[28px] border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.04)] p-5">
                  <h2 className="text-lg font-black text-[#f3dfac]">
                    ماذا يعني التأهيل المبدئي؟
                  </h2>
                  <p className="mt-3 text-sm font-bold leading-8 text-[#d7ddd5]">
                    هذا يعني أن الطلب مستوفي للشروط الأساسية المطلوبة مبدئيًا، وسيتم تحويله لقسم الدراسة النهائية بعد فتح الملف.
                  </p>
                  <p className="mt-3 text-sm font-bold leading-8 text-[#d7ddd5]">
                    مهم جدًا: هذه المرحلة لا تعني الموافقة النهائية بعد، لكنها تعني أن الطلب اجتاز مرحلة الفرز الأولي بنجاح، وهي مرحلة لا تصل إليها جميع الطلبات.
                  </p>
                </div>

                <div className="rounded-[28px] border border-[rgba(214,181,107,0.28)] bg-[rgba(214,181,107,0.09)] p-5">
                  <h2 className="text-lg font-black text-[#f3dfac]">
                    رسوم فتح الملف: 5 دنانير فقط
                  </h2>
                  <p className="mt-3 text-sm font-bold leading-8 text-[#f7f3e8]">
                    رسوم فتح الملف هدفها تأكيد جدية الطلب، فتح ملف دراسة رسمي باسمكم، وتحويل الطلب للقسم المختص بدل بقائه كطلب مبدئي فقط.
                  </p>

                  <div className="mt-4 rounded-2xl border border-[rgba(105,217,123,0.28)] bg-[rgba(105,217,123,0.09)] p-4 text-sm font-black leading-8 text-[#b8f3c0]">
                    <p>✅ الرسوم مستردة بالكامل في حال عدم الموافقة.</p>
                    <p>✅ وفي حال إتمام العقد والاستلام، يتم احتسابها ضمن إجراءات الملف.</p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-sky-300/20 bg-sky-950/20 p-5">
                  <h2 className="text-lg font-black text-sky-100">
                    ماذا يحدث بعد التأكيد؟
                  </h2>
                  <ol className="mt-3 list-inside list-decimal space-y-2 text-sm font-bold leading-7 text-sky-100/90">
                    <li>يتم تسجيل رغبتكم بالاستمرار داخل النظام.</li>
                    <li>يتم فتح ملف رسمي للطلب.</li>
                    <li>يتم تحويل الطلب إلى قسم الدراسة النهائية.</li>
                    <li>يتم الرد خلال 24 إلى 72 ساعة حسب ضغط الطلبات.</li>
                  </ol>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <form action="/api/continue-decision" method="POST">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                  <input type="hidden" name="phone" value={app.phone || ""} />
                  <input type="hidden" name="decision" value="confirmed" />
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-[#69d97b] px-5 py-4 text-sm font-black text-[#062b13] shadow-lg transition hover:opacity-90"
                  >
                    نعم، أريد الاستمرار وفتح الملف
                  </button>
                </form>

                <form action="/api/continue-decision" method="POST">
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                  <input type="hidden" name="phone" value={app.phone || ""} />
                  <input type="hidden" name="decision" value="declined" />
                  <button
                    type="submit"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-black text-[#d7ddd5] transition hover:bg-white/10"
                  >
                    لا، لا أرغب بالاستمرار حاليًا
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
