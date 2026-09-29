import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { IPHONE18_COLORS, IPHONE18_PRODUCTS } from "@/app/api/whatsapp/webhook/_lib/v3-os/businessTruthRegistry";
import {
  deviceChangeIdempotencyKey,
  deviceChangeRowHasAuthoritativePaymentConfirmation,
  readDeviceChangeToken,
} from "@/app/api/whatsapp/webhook/_lib/v3-os/deviceChangeAuthority";

type PageProps = {
  searchParams?: Promise<{
    t?: string;
    error?: string;
  }>;
};

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "عميلنا الكريم";
}

function currentDeviceName(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || "غير محدد";
}

function errorMessage(error: string) {
  switch (error) {
    case "expired_or_invalid":
      return "رابط تغيير الجهاز غير صالح أو انتهت مدته. ارجع لنفس محادثة واتساب واطلب رابط تغيير جديد.";
    case "request_changed":
      return "حالة الطلب تغيّرت بعد إصدار الرابط، لذلك تم إيقاف الرابط القديم لحماية الطلب. اطلب رابطًا جديدًا من نفس محادثة واتساب.";
    case "not_eligible":
      return "حالة الطلب الحالية لا تسمح بتغيير الجهاز من هذا الرابط.";
    case "missing_fields":
      return "اختر الجهاز واللون ثم أعد المحاولة.";
    case "terms_missing":
      return "تعذر تثبيت الحسبة الحالية للطلب، لذلك لم يتم تنفيذ أي تغيير.";
    case "actions_disabled":
      return "تنفيذ تغييرات الطلبات متوقف حاليًا من لوحة التحكم. لم يتم تعديل الطلب.";
    case "save_failed":
      return "تعذر تنفيذ تغيير الجهاز مؤقتًا. لم يتم تعديل الطلب؛ حاول مرة أخرى أو اطلب رابطًا جديدًا من واتساب.";
    default:
      return "تعذر فتح رابط تغيير الجهاز. اطلب رابطًا جديدًا من نفس محادثة واتساب.";
  }
}

function jod(value: number) {
  return `${value.toLocaleString("en-US")} د.أ`;
}

export default async function ChangeDevicePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = String(params?.t || "").trim();
  const error = String(params?.error || "").trim();
  const claims = token ? readDeviceChangeToken(token) : null;

  if (!claims) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">الرابط غير صالح</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">{errorMessage("expired_or_invalid")}</p>
        </section>
      </main>
    );
  }

  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id,tracking_id,full_name,phone,email,status,payment_status,payment_confirmed_at,payment_reference,device_id,device_name,device_price,installment_months,down_payment,interest_rate,monthly_payment,total_with_interest,salary,delivery_delay_until")
    .eq("id", claims.applicationId)
    .maybeSingle();

  if (!application || String(application.tracking_id || "").toUpperCase() !== claims.trackingId) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black text-red-700">تعذر التحقق من الطلب</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">اطلب رابط تغيير جديد من نفس محادثة واتساب.</p>
        </section>
      </main>
    );
  }

  if (!deviceChangeRowHasAuthoritativePaymentConfirmation(application as Record<string, unknown>)) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]">
        <section className="mx-auto max-w-xl rounded-[32px] border border-amber-200 bg-white p-7 text-center shadow-xl">
          <h1 className="text-2xl font-black text-amber-700">الرابط غير متاح قبل تأكيد الدفع</h1>
          <p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">رابط تغيير الجهاز مخصص فقط للطلبات التي تم تأكيد دفعها إداريًا. لم يتم تعديل الطلب.</p>
        </section>
      </main>
    );
  }

  const { data: ledger } = await supabaseAdmin
    .from("whatsapp_v3_action_ledger")
    .select("status,after_snapshot,blocker")
    .eq("idempotency_key", deviceChangeIdempotencyKey(claims))
    .maybeSingle();

  const completed = ["executed", "already_done"].includes(String(ledger?.status || ""));
  const customerName = firstTwoNames(application.full_name);
  const currentDevice = currentDeviceName(application.device_name);

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden bg-[#f4ecdd] px-4 py-6 text-[#17261d] sm:py-10">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,176,95,0.30),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(17,58,37,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f5ecdc_45%,#e8dcc6_100%)]" />
      </div>

      <section className="relative mx-auto max-w-3xl">
        <div className="rounded-[36px] border border-[#e0c27a] bg-white/92 p-[1px] shadow-[0_30px_100px_rgba(59,43,18,0.18)] backdrop-blur">
          <div className="rounded-[35px] bg-[linear-gradient(180deg,#ffffff_0%,#fffdf8_55%,#fbf5eb_100%)] p-6 text-center sm:p-9">
            <p className="mx-auto mb-4 inline-flex rounded-full border border-[#d8bd7a] bg-[#fff8e8] px-5 py-2 text-xs font-black text-[#876420]">الأمين للأقساط</p>
            <h1 className="text-3xl font-black leading-[1.7] text-[#123725] sm:text-4xl">تغيير الجهاز على نفس الطلب</h1>
            <p className="mx-auto mt-3 max-w-2xl text-base font-bold leading-8 text-[#5e6b62]">
              أهلًا {customerName}، هذا الرابط مؤقت ومخصص للطلب {claims.trackingId}. التغيير يتم على نفس الطلب ويحافظ على حقيقة الدفع الحالية.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[28px] border border-[#eadcc5] bg-white/92 p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#818981]">الجهاز الحالي</p>
            <p className="mt-2 break-words text-base font-black leading-7 text-[#123725]">{currentDevice}</p>
          </div>
          <div className="rounded-[28px] border border-[#e2c984] bg-[#fff8e8] p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]">
            <p className="text-xs font-black text-[#7c5b13]">شروط الحسبة الحالية</p>
            <p className="mt-2 text-sm font-black text-[#7c5b13]">المدة: {application.installment_months || "—"} شهر</p>
            <p className="mt-1 text-sm font-black text-[#7c5b13]">الدفعة الأولى: {Number(application.down_payment || 0).toFixed(2)} د.أ</p>
          </div>
        </div>

        {completed ? (
          <section className="mt-5 rounded-[34px] border border-[#b8ddc4] bg-white/94 p-7 text-center shadow-[0_24px_70px_rgba(60,45,20,0.14)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ecfff1] text-3xl font-black text-[#14723a]">✓</div>
            <h2 className="mt-4 text-2xl font-black text-[#14723a]">تم تغيير الجهاز بنجاح</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#526158]">
              التنفيذ مثبت في سجل الإجراءات، والجهاز المسجل الآن على الطلب هو: {currentDevice}.
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
            {error && (
              <div className="mb-5 rounded-[24px] border border-[#efd0d0] bg-[#fff5f4] p-4 text-center">
                <h2 className="text-lg font-black text-[#9d2f2f]">لم يتم تنفيذ التغيير</h2>
                <p className="mt-2 text-sm font-bold leading-7 text-[#6a5d5d]">{errorMessage(error)}</p>
              </div>
            )}

            <div className="mb-5 rounded-2xl border border-[#e7d8bd] bg-[#fffaf1] p-4 text-sm font-bold leading-7 text-[#5e6b62]">
              الأسعار المعتمدة في هذا المسار حاليًا هي أسعار iPhone 18 فقط. لن نستخدم سعرًا قديمًا أو غير موثق لإعادة الحسبة.
            </div>

            <form action="/api/change-device" method="POST">
              <input type="hidden" name="token" value={token} />

              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#7c5b13]">الجهاز الجديد</span>
                <select required name="productId" defaultValue="" className="w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]">
                  <option value="" disabled>اختر الجهاز والسعة</option>
                  {IPHONE18_PRODUCTS.map((product) => (
                    <option key={product.id} value={product.id}>{product.model} — {product.capacity} — {jod(product.priceJod)}</option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-black text-[#7c5b13]">اللون المطلوب</span>
                <select required name="color" defaultValue="" className="w-full rounded-2xl border border-[#eadcc5] bg-white px-4 py-3 text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]">
                  <option value="" disabled>اختر اللون</option>
                  {IPHONE18_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
              </label>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e7d8bd] bg-[#fffaf1] p-4">
                <input required type="checkbox" name="acknowledged" value="1" className="mt-1 h-4 w-4" />
                <span className="text-xs font-bold leading-6 text-[#5e6b62]">
                  أؤكد أني أريد تغيير الجهاز على نفس الطلب. سيتم تحديث الجهاز والحسبة الرسمية مع الحفاظ على حالة الدفع الحالية، ولن يتم إنشاء طلب جديد.
                </span>
              </label>

              <button type="submit" className="mt-5 w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]">
                تأكيد تغيير الجهاز
              </button>
            </form>
          </section>
        )}

        <div className="mt-5 rounded-[24px] border border-[#eadcc5] bg-white/70 p-4 shadow-sm">
          <h2 className="text-sm font-black text-[#6b745f]">حماية الرابط</h2>
          <p className="mt-2 text-xs font-bold leading-7 text-[#7a837c]">
            الرابط مشفّر ومؤقت ومربوط بطلب واحد. إذا تغيرت حالة الطلب بعد إصدار الرابط، يتوقف الرابط القديم ويطلب النظام رابطًا جديدًا. إعادة إرسال النموذج لا تنفذ التغيير مرتين.
          </p>
        </div>
      </section>
    </main>
  );
}
