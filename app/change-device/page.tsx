import { findApplicationByTrackingAndPhone } from "@/app/api/whatsapp/webhook/_lib/applicationLookup";

type PageProps = {
  searchParams?: Promise<{
    tracking?: string;
    phone?: string;
    submitted?: string;
    already?: string;
    error?: string;
  }>;
};

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "عميلنا الكريم";
}

function customerFacingDeviceName(value: string | null | undefined) {
  let clean = String(value || "").replace(/\r/g, " ").replace(/\n+/g, " ").trim();
  if (!clean) return "غير محدد";

  clean = clean
    .split(/(?:\s*-\s*)?(?:ملاحظة اللون|ملاحظه اللون|ملاحظة|ملاحظه)\s*:/i)[0]
    .split(/(?:أو|او)\s+الاتصال\s+على/i)[0]
    .split(/(?:رقم\s+الاتصال|للتواصل)\s*:/i)[0]
    .replace(/(?:\+?962|0)?7\d{8}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s،,;:\-–]+$/g, "")
    .trim();

  return clean || "غير محدد";
}

function errorMessage(error: string) {
  switch (error) {
    case "missing_fields":
      return "يرجى تعبئة الجهاز والسعة واللون المطلوبين.";
    case "invalid_request":
      return "تعذر التحقق من بيانات طلب التعديل. افتح الرابط الرسمي المرسل لك مرة ثانية.";
    case "save_failed":
      return "تعذر تسجيل طلب التعديل مؤقتًا. يرجى المحاولة مرة أخرى.";
    default:
      return "حدث خطأ مؤقت. يرجى المحاولة مرة أخرى.";
  }
}

export default async function ChangeDevicePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tracking = String(params?.tracking || "").trim().toUpperCase();
  const phone = String(params?.phone || "").trim();
  const submitted = params?.submitted === "1";
  const already = params?.already === "1";
  const error = String(params?.error || "").trim();

  const application = tracking && phone
    ? await findApplicationByTrackingAndPhone(tracking, phone)
    : null;

  if (!application) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">لم يتم العثور على الطلب</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">
            افتح رابط تعديل الجهاز المرسل لك عبر واتساب. الرابط مرتبط برقم طلبك ورقم الهاتف المستخدم بالتقديم.
          </p>
        </section>
      </main>
    );
  }

  const customerName = firstTwoNames(application.full_name);
  const currentDevice = customerFacingDeviceName(application.device_name);

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
              طلب تعديل الجهاز
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base font-bold leading-8 text-[#5e6b62]">
              أهلًا {customerName}، أدخل الجهاز والسعة واللون المطلوبين. طلب التقسيط لا يُلغى، والجهاز الحالي يبقى مسجلًا إلى أن تتم مراجعة التعديل واعتماده.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[28px] border border-[#eadcc5] bg-white/92 p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#818981]">الجهاز الحالي</p>
            <p className="mt-2 break-words text-base font-black leading-7 text-[#123725]">{currentDevice}</p>
          </div>
          <div className="rounded-[28px] border border-[#e2c984] bg-[#fff8e8] p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#7c5b13]">رقم التتبع</p>
            <p className="mt-2 break-words text-lg font-black text-[#7c5b13]">{application.tracking_id || application.id}</p>
          </div>
        </div>

        {submitted ? (
          <section className="mt-5 rounded-[34px] border border-[#b8ddc4] bg-white/94 p-7 text-center shadow-[0_24px_70px_rgba(60,45,20,0.14)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ecfff1] text-3xl font-black text-[#14723a]">✓</div>
            <h2 className="mt-4 text-2xl font-black text-[#14723a]">
              {already ? "طلب التعديل مسجل مسبقًا" : "تم استلام طلب التعديل"}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#526158]">
              تم ربط الطلب بملفك وإرساله للمتابعة. الجهاز الحالي لن يتغير تلقائيًا، وسيبقى كما هو إلى أن تتم مراجعة التعديل واعتماده.
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
            {error && (
              <div className="mb-5 rounded-[24px] border border-[#efd0d0] bg-[#fff5f4] p-4 text-center">
                <h2 className="text-lg font-black text-[#9d2f2f]">تعذر تسجيل التعديل</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-[#6a5d5d]">{errorMessage(error)}</p>
              </div>
            )}

            <form action="/api/change-device" method="POST">
              <input type="hidden" name="tracking" value={application.tracking_id || application.id} />
              <input type="hidden" name="phone" value={application.phone || phone} />

              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#7c5b13]">الجهاز الجديد</span>
                <input
                  required
                  name="device"
                  maxLength={80}
                  className="w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-right text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]"
                  placeholder="مثال: Samsung Galaxy S26 Ultra"
                />
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7c5b13]">السعة</span>
                  <select required name="capacity" defaultValue="" className="w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]">
                    <option value="" disabled>اختر السعة</option>
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                    <option value="1TB">1TB</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7c5b13]">اللون المطلوب</span>
                  <input
                    required
                    name="color"
                    maxLength={40}
                    className="w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-right text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]"
                    placeholder="مثال: أزرق أو أي لون متوفر"
                  />
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-black text-[#7c5b13]">لون بديل — اختياري</span>
                <input
                  name="alternateColor"
                  maxLength={40}
                  className="w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-right text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]"
                  placeholder="مثال: فضي"
                />
              </label>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e7d8bd] bg-[#fffaf1] p-4">
                <input required type="checkbox" name="acknowledged" value="1" className="mt-1 h-4 w-4" />
                <span className="text-xs font-bold leading-6 text-[#5e6b62]">
                  أفهم أن هذا طلب تعديل قيد المراجعة، وقد تتغير قيمة القسط أو التوفر حسب الجهاز الجديد، ولن يتغير الجهاز المسجل قبل اعتماد الطلب.
                </span>
              </label>

              <button type="submit" className="mt-5 w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]">
                إرسال طلب تعديل الجهاز
              </button>
            </form>
          </section>
        )}

        <div className="mt-5 rounded-[24px] border border-[#eadcc5] bg-white/70 p-4 shadow-sm">
          <h2 className="text-sm font-black text-[#6b745f]">ملاحظة مهمة</h2>
          <p className="mt-2 text-xs font-bold leading-7 text-[#7a837c]">
            إرسال النموذج لا يعني توفر الجهاز أو اعتماده فورًا. ستتم مراجعة القيمة والتوفر، ولن يتم إلغاء طلبك الأصلي بسبب طلب التعديل.
          </p>
        </div>
      </section>
    </main>
  );
}
