import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  searchParams?: Promise<{
    tracking?: string;
    phone?: string;
    uploaded?: string;
    error?: string;
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

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[1]}`;
}

function errorMessage(error: string) {
  switch (error) {
    case "missing_file":
      return "يرجى اختيار صورة أو ملف كشف الراتب أولًا.";
    case "invalid_file":
      return "نوع الملف غير مدعوم. يرجى رفع صورة أو PDF فقط.";
    case "file_too_large":
      return "حجم الملف كبير جدًا. يرجى رفع ملف أقل من 8MB.";
    case "upload_failed":
      return "تعذر رفع الملف مؤقتًا. يرجى المحاولة مرة أخرى.";
    default:
      return "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى أو التواصل معنا.";
  }
}

export default async function SalarySlipPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tracking = String(params?.tracking || "").trim();
  const phone = String(params?.phone || "").trim();
  const uploaded = params?.uploaded === "1";
  const error = String(params?.error || "").trim();

  if (!tracking || !phone) redirect("/");

  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, status, payment_status")
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (!application) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">لم يتم العثور على الطلب</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">
            يرجى فتح الرابط الصحيح المرسل من فريق الأمين للأقساط أو التواصل معنا للمساعدة.
          </p>
        </section>
      </main>
    );
  }

  const app = application as ApplicationRecord;
  const customerName = firstTwoNames(app.full_name);

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden bg-[#f4ecdd] px-4 py-6 text-[#17261d] sm:py-10">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,176,95,0.30),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(17,58,37,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f5ecdc_45%,#e8dcc6_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(135deg,rgba(130,92,30,0.35)_1px,transparent_1px),linear-gradient(45deg,rgba(130,92,30,0.22)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <section className="relative mx-auto max-w-3xl">
        <div className="rounded-[36px] border border-[#e0c27a] bg-white/92 p-[1px] shadow-[0_30px_100px_rgba(59,43,18,0.18)] backdrop-blur">
          <div className="rounded-[35px] bg-[linear-gradient(180deg,#ffffff_0%,#fffdf8_55%,#fbf5eb_100%)] p-6 text-center sm:p-9">
            <p className="mx-auto mb-4 inline-flex rounded-full border border-[#d8bd7a] bg-[#fff8e8] px-5 py-2 text-xs font-black text-[#876420]">
              الأمين للأقساط
            </p>

            <h1 className="text-3xl font-black leading-[1.7] text-[#123725] sm:text-4xl">
              رفع كشف راتب رسمي
            </h1>

            <p className="mx-auto mt-3 max-w-2xl text-base font-bold leading-8 text-[#5e6b62]">
              أهلًا {customerName}، لاستكمال إجراءات الدراسة النهائية حسب متطلبات الموافقة، يرجى رفع كشف راتب رسمي حديث أو شهادة راتب صادرة من جهة العمل.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
        </div>

        {uploaded ? (
          <section className="mt-5 rounded-[34px] border border-[#b8ddc4] bg-white/94 p-6 text-center shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#37b75d] text-3xl font-black text-white">
              ✓
            </div>
            <h2 className="text-2xl font-black text-[#14723a]">
              تم استلام كشف الراتب ✅
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#526158]">
              تم رفع الملف بنجاح، وسيتم تحويله لقسم المراجعة لاستكمال دراسة الطلب. لا يلزم إعادة رفع الملف مرة أخرى.
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
            {error && (
              <div className="mb-5 rounded-[24px] border border-[#efd0d0] bg-[#fff5f4] p-4 text-center">
                <h2 className="text-lg font-black text-[#9d2f2f]">تعذر رفع كشف الراتب</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-[#6a5d5d]">
                  {errorMessage(error)}
                </p>
              </div>
            )}

            <div className="mb-5 rounded-[28px] border border-[#e7d8bd] bg-[#fffaf1] p-5 text-center">
              <h2 className="text-2xl font-black text-[#123725]">
                يرجى اختيار كشف الراتب الرسمي
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#627064]">
                ارفع صورة واضحة أو ملف PDF لكشف راتب حديث أو شهادة راتب من جهة العمل. هذه الخطوة لاستكمال إجراءات الملف فقط ولا تعني رفض الطلب.
              </p>
            </div>

            <form action="/api/salary-slip" method="POST" encType="multipart/form-data">
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
              <input type="hidden" name="phone" value={app.phone || ""} />

              <label className="block rounded-2xl border border-dashed border-[#d8bd7a] bg-[#fffaf1] p-5 text-center">
                <span className="block text-sm font-black text-[#7c5b13]">
                  اختر صورة أو ملف PDF
                </span>
                <input
                  required
                  type="file"
                  name="salarySlip"
                  accept="image/*,.pdf"
                  className="mt-4 w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-sm font-bold text-[#123725]"
                />
              </label>

              <button
                type="submit"
                className="mt-5 w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]"
              >
                رفع كشف الراتب وإرساله للمراجعة
              </button>
            </form>
          </section>
        )}

        <div className="mt-5 rounded-[24px] border border-[#eadcc5] bg-white/70 p-4 shadow-sm">
          <h2 className="text-sm font-black text-[#6b745f]">ملاحظة توضيحية</h2>
          <p className="mt-2 text-xs font-bold leading-7 text-[#7a837c]">
            طلب كشف الراتب الرسمي هو إجراء تنظيمي لاستكمال الدراسة النهائية لبعض الملفات حسب سياسة الموافقة، ولا يعني رفض الطلب أو وجود مشكلة في الطلب.
          </p>
        </div>
      </section>
    </main>
  );
}
