import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  searchParams?: Promise<{
    tracking?: string;
    phone?: string;
    amount?: string;
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
};

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

function normalizeAmount(value: string | undefined) {
  return String(value || "").trim().replace(/[^\d.]/g, "");
}

export default async function SalarySlipPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tracking = String(params?.tracking || "").trim();
  const phone = String(params?.phone || "").trim();
  const amount = normalizeAmount(params?.amount);
  const uploaded = params?.uploaded === "1";
  const error = String(params?.error || "").trim();

  if (!tracking || !phone) redirect("/");

  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name")
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (!application) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">لم يتم العثور على الطلب</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">
            يرجى فتح الرابط الصحيح المرسل من فريق الأمين للأقساط والتمويل أو التواصل معنا للمساعدة.
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

      <section className="relative mx-auto max-w-4xl">
        <div className="rounded-[36px] border border-[#e0c27a] bg-white/92 p-[1px] shadow-[0_30px_100px_rgba(59,43,18,0.18)] backdrop-blur">
          <div className="rounded-[35px] bg-[linear-gradient(180deg,#ffffff_0%,#fffdf8_55%,#fbf5eb_100%)] p-6 text-center sm:p-9">
            <p className="mx-auto mb-4 inline-flex rounded-full border border-[#d8bd7a] bg-[#fff8e8] px-5 py-2 text-xs font-black text-[#876420]">
              الأمين للأقساط والتمويل
            </p>
            <h1 className="text-3xl font-black leading-[1.7] text-[#123725] sm:text-4xl">
              أهلاً {customerName}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base font-bold leading-8 text-[#5e6b62]">
              لاستكمال دراسة الطلب، يرجى اختيار أحد الخيارين التاليين حسب ما تم الاتفاق عليه مع قسم المتابعة.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[28px] border border-[#eadcc5] bg-white/92 p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#818981]">الجهاز المطلوب</p>
            <p className="mt-2 break-words text-base font-black leading-7 text-[#123725]">{app.device_name || "—"}</p>
          </div>
          <div className="rounded-[28px] border border-[#eadcc5] bg-white/92 p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#818981]">رقم التتبع</p>
            <p className="mt-2 break-words text-lg font-black text-[#123725]">{app.tracking_id || app.id}</p>
          </div>
          <div className="rounded-[28px] border border-[#e2c984] bg-[#fff8e8] p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#7c5b13]">قيمة القسط الأول</p>
            <p className="mt-2 text-lg font-black text-[#7c5b13]">{amount ? `${amount} دنانير` : "حسب تحديد الإدارة"}</p>
          </div>
        </div>

        {uploaded && (
          <div className="mt-5 rounded-[28px] border border-[#b8ddc4] bg-[#edf9f0] p-5 text-center shadow-sm">
            <h2 className="text-2xl font-black text-[#14723a]">تم استلام كشف الراتب ✅</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-[#526158]">تم رفع الملف بنجاح، وسيتم تحويله لقسم المراجعة لاستكمال دراسة الطلب.</p>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-[28px] border border-[#efd0d0] bg-[#fff5f4] p-5 text-center shadow-sm">
            <h2 className="text-xl font-black text-[#9d2f2f]">تعذر تنفيذ العملية</h2>
            <p className="mt-3 text-sm font-bold leading-7 text-[#6a5d5d]">
              {error === "missing_file" ? "يرجى اختيار صورة أو ملف كشف الراتب أولاً." : "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى أو التواصل معنا."}
            </p>
          </div>
        )}

        {!uploaded && (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)]">
              <div className="mb-5 rounded-[28px] border border-[#e7d8bd] bg-[#fffaf1] p-5">
                <h2 className="text-2xl font-black text-[#123725]">الخيار الأول: رفع كشف الراتب</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[#627064]">ارفع كشف راتب حديث أو شهادة راتب واضحة صادرة من جهة العمل لاستكمال الدراسة.</p>
              </div>

              <form action="/api/salary-slip" method="POST" encType="multipart/form-data">
                <input type="hidden" name="applicationId" value={app.id} />
                <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                <input type="hidden" name="phone" value={app.phone || ""} />
                <input type="hidden" name="amount" value={amount} />
                <input type="hidden" name="actionType" value="upload_salary_slip" />

                <label className="block rounded-2xl border border-dashed border-[#d8bd7a] bg-[#fffaf1] p-5 text-center">
                  <span className="block text-sm font-black text-[#7c5b13]">اختر صورة أو ملف PDF</span>
                  <input required type="file" name="salarySlip" accept="image/*,.pdf" className="mt-4 w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-sm font-bold text-[#123725]" />
                </label>

                <button type="submit" className="mt-4 w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]">
                  رفع كشف الراتب وإرساله للمراجعة
                </button>
              </form>
            </section>

            <section className="rounded-[34px] border border-[#e2c984] bg-[#fff8e8] p-6 shadow-[0_24px_70px_rgba(60,45,20,0.12)]">
              <div className="mb-5 rounded-[28px] border border-[#e2c984] bg-white/65 p-5">
                <h2 className="text-2xl font-black text-[#7c5b13]">الخيار الثاني: دفع القسط الأول</h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[#594c2c]">
                  في حال رغبتكم بتثبيت الطلب من خلال دفع القسط الأول بدل رفع كشف الراتب، اضغطوا على الزر التالي ليتم تحويلكم إلى واتساب.
                </p>
                <p className="mt-3 rounded-2xl border border-[#e2c984] bg-[#fffaf1] p-4 text-sm font-black text-[#7c5b13]">
                  قيمة القسط الأول: {amount ? `${amount} دنانير` : "يتم تحديدها من قسم المتابعة"}
                </p>
              </div>

              <form action="/api/salary-slip" method="POST">
                <input type="hidden" name="applicationId" value={app.id} />
                <input type="hidden" name="tracking" value={app.tracking_id || app.id} />
                <input type="hidden" name="phone" value={app.phone || ""} />
                <input type="hidden" name="amount" value={amount} />
                <input type="hidden" name="actionType" value="first_installment_whatsapp" />

                <button type="submit" className="w-full rounded-2xl bg-[#123725] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:opacity-90">
                  أريد دفع القسط الأول عبر واتساب
                </button>
              </form>

              <p className="mt-4 text-xs font-bold leading-6 text-[#7b6b47]">
                ملاحظة: الدفع لا يعني الموافقة النهائية إلا بعد استكمال المراجعة والإجراءات المطلوبة حسب سياسة الشركة.
              </p>
            </section>
          </div>
        )}

        <div className="mt-5 rounded-[24px] border border-[#eadcc5] bg-white/70 p-4 shadow-sm">
          <h2 className="text-sm font-black text-[#6b745f]">ملاحظة توضيحية</h2>
          <p className="mt-2 text-xs font-bold leading-7 text-[#7a837c]">
            جميع المعلومات والملفات المرسلة تستخدم فقط لاستكمال دراسة طلب التمويل لدى الأمين للأقساط والتمويل.
          </p>
        </div>
      </section>
    </main>
  );
}
