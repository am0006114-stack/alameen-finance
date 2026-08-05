import Link from "next/link";
import { findApplicationByTrackingAndPhone } from "@/app/api/whatsapp/webhook/_lib/applicationLookup";
import { products } from "@/lib/products";
import SelectDeviceClient from "./SelectDeviceClient";

type PageProps = {
  searchParams?: Promise<{
    tracking?: string;
    phone?: string;
    submitted?: string;
    error?: string;
  }>;
};

function hasSpecificDevice(value: string | null | undefined) {
  const clean = String(value || "").trim().toLowerCase();
  if (!clean) return false;

  return ![
    "الجهاز المطلوب",
    "غير محدد",
    "غير متوفر",
    "لم يتم اختيار جهاز",
    "بدون جهاز",
    "device",
  ].some((item) => clean === item.toLowerCase());
}

function firstTwoNames(value: string | null | undefined) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "عميلنا الكريم";
}

function errorMessage(code: string) {
  switch (code) {
    case "missing_fields":
      return "اختر الجهاز والمدة واللون، وتأكد من قيمة الدفعة الأولى.";
    case "invalid_request":
      return "تعذر التحقق من الطلب. افتح الرابط الرسمي المرسل لك مرة أخرى.";
    case "already_has_device":
      return "يوجد جهاز مسجل على الطلب. استخدم رابط تغيير الجهاز بدل اختيار جهاز أول مرة.";
    case "save_failed":
      return "تعذر حفظ اختيار الجهاز مؤقتًا. حاول مرة أخرى.";
    default:
      return "حدث خطأ مؤقت أثناء حفظ اختيار الجهاز.";
  }
}

export default async function SelectDevicePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tracking = String(params?.tracking || "").trim().toUpperCase();
  const phone = String(params?.phone || "").trim();
  const submitted = params?.submitted === "1";
  const error = String(params?.error || "").trim();

  const application = tracking && phone
    ? await findApplicationByTrackingAndPhone(tracking, phone)
    : null;

  if (!application) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#03120e] px-4 py-10 text-white">
        <section className="glass-panel gold-outline mx-auto max-w-xl rounded-[32px] p-7 text-center">
          <h1 className="text-2xl font-black text-red-300">لم يتم العثور على الطلب</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#cbd6cb]">
            افتح رابط اختيار الجهاز المرسل لك عبر واتساب؛ الرابط مرتبط برقم الطلب ورقم الهاتف المستخدم في التقديم.
          </p>
        </section>
      </main>
    );
  }

  if (submitted) {
    return (
      <main dir="rtl" className="page-enter min-h-screen bg-[#03120e] px-4 py-10 text-white">
        <section className="glass-panel gold-outline mx-auto max-w-2xl rounded-[32px] p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#69d97b]/30 bg-[#69d97b]/10 text-4xl text-[#b8f3c0]">✓</div>
          <h1 className="mt-5 text-3xl font-black text-[#b8f3c0]">تم اختيار الجهاز وربطه بطلبك</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-[#cbd6cb]">
            تم تحديث نفس رقم الطلب، ولا تحتاج لتقديم طلب جديد. سيظهر الجهاز المختار في المتابعة بعد تحديث البيانات.
          </p>
          <Link href="/track" className="green-button button-shimmer mt-6 inline-flex rounded-2xl px-6 py-4 text-sm font-black">
            متابعة الطلب
          </Link>
        </section>
      </main>
    );
  }

  if (hasSpecificDevice(application.device_name)) {
    const changeHref = `/change-device?tracking=${encodeURIComponent(application.tracking_id || application.id)}&phone=${encodeURIComponent(application.phone || phone)}`;

    return (
      <main dir="rtl" className="page-enter min-h-screen bg-[#03120e] px-4 py-10 text-white">
        <section className="glass-panel gold-outline mx-auto max-w-2xl rounded-[32px] p-7 text-center">
          <p className="gold-chip mx-auto inline-flex rounded-full px-4 py-2 text-xs font-black">الأمين للأقساط</p>
          <h1 className="mt-5 text-3xl font-black">الجهاز مسجل على طلبك</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-[#cbd6cb]">
            الجهاز الحالي: {application.device_name}. إذا بدك تغيّره استخدم رابط تعديل الجهاز الرسمي.
          </p>
          <Link href={changeHref} className="gold-button button-shimmer mt-6 inline-flex rounded-2xl px-6 py-4 text-sm font-black">
            فتح نموذج تغيير الجهاز
          </Link>
        </section>
      </main>
    );
  }


  return (
    <main dir="rtl" className="page-enter relative min-h-screen overflow-x-hidden px-4 py-8 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="ambient-orb absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="ambient-orb ambient-orb-delay absolute bottom-[-100px] left-[-100px] h-[300px] w-[300px] rounded-full bg-[#69d97b]/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl">
        <div className="site-shell animate-fade-up rounded-[34px] p-6 text-center sm:p-9">
          <p className="gold-chip mx-auto inline-flex rounded-full px-5 py-2 text-xs font-black">إكمال الطلب الحالي</p>
          <h1 className="mt-5 text-3xl font-black sm:text-5xl">اختر الجهاز المطلوب</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-bold leading-8 text-[#cbd6cb]">
            أهلًا {firstTwoNames(application.full_name)}، اختيارك سيُحفظ على نفس الطلب رقم {application.tracking_id || application.id} ولن يتم إنشاء طلب جديد.
          </p>
        </div>

        {error && (
          <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-center text-sm font-black text-red-200">
            {errorMessage(error)}
          </div>
        )}

        <SelectDeviceClient
          tracking={application.tracking_id || application.id}
          phone={application.phone || phone}
          products={products}
        />
      </section>
    </main>
  );
}
