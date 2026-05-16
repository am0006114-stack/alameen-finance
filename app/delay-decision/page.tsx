import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = { searchParams?: Promise<{ tracking?: string; phone?: string; result?: string }> };
type ApplicationRecord = { id: string; tracking_id?: string | null; full_name?: string | null; phone?: string | null; device_name?: string | null; status?: string | null; payment_status?: string | null };

function firstTwoNames(fullName: string | null | undefined) {
  if (!fullName) return "عميلنا الكريم";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "عميلنا الكريم";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

export default async function DelayDecisionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tracking = String(params?.tracking || "").trim();
  const phone = String(params?.phone || "").trim();
  const result = String(params?.result || "").trim();
  if (!tracking || !phone) redirect("/");

  const { data: application } = await supabaseAdmin
    .from("applications")
    .select("id, tracking_id, full_name, phone, device_name, status, payment_status")
    .eq("tracking_id", tracking)
    .eq("phone", phone)
    .maybeSingle();

  if (!application) {
    return <main dir="rtl" className="min-h-screen bg-[#f4ecdd] px-4 py-10 text-[#17261d]"><section className="mx-auto max-w-xl rounded-[32px] border border-red-200 bg-white p-7 text-center shadow-xl"><h1 className="text-2xl font-black text-red-700">لم يتم العثور على الطلب</h1><p className="mt-4 text-sm font-bold leading-7 text-[#5f6b63]">يرجى فتح الرابط الصحيح المرسل من فريق الأمين للأقساط والتمويل أو التواصل معنا للمساعدة.</p></section></main>;
  }

  const app = application as ApplicationRecord;
  const customerName = firstTwoNames(app.full_name);
  const acceptedDelay = result === "wait" || app.status === "customer_accepts_delivery_delay";
  const refundRequested = result === "refund" || app.status === "refund_requested";

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden bg-[#f4ecdd] px-4 py-6 text-[#17261d] sm:py-10">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,176,95,0.30),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(17,58,37,0.18),transparent_34%),linear-gradient(135deg,#fffaf0_0%,#f5ecdc_45%,#e8dcc6_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(135deg,rgba(130,92,30,0.35)_1px,transparent_1px),linear-gradient(45deg,rgba(130,92,30,0.22)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>
      <section className="relative mx-auto max-w-4xl">
        <div className="rounded-[36px] border border-[#e0c27a] bg-white/92 p-[1px] shadow-[0_30px_100px_rgba(59,43,18,0.18)] backdrop-blur">
          <div className="rounded-[35px] bg-[linear-gradient(180deg,#ffffff_0%,#fffdf8_55%,#fbf5eb_100%)] p-6 text-center sm:p-9">
            <p className="mx-auto mb-4 inline-flex rounded-full border border-[#d8bd7a] bg-[#fff8e8] px-5 py-2 text-xs font-black text-[#876420]">الأمين للأقساط والتمويل</p>
            <h1 className="text-3xl font-black leading-[1.7] text-[#123725] sm:text-4xl">تحديث مهم على موعد التسليم</h1>
            <p className="mx-auto mt-3 max-w-2xl text-base font-bold leading-8 text-[#5e6b62]">أهلًا {customerName}، نعتذر منكم، تم تمديد موعد تسليم بعض الطلبات لمدة 3 أيام عمل بسبب مراجعة داخلية طارئة على الإجراءات، وذلك لضمان دقة الطلبات وعدالة الموافقات لجميع العملاء.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Info label="الجهاز" value={app.device_name || "—"} />
          <Info label="رقم التتبع" value={app.tracking_id || app.id} />
          <Info label="مدة التمديد" value="3 أيام عمل" gold />
        </div>

        {acceptedDelay ? (
          <section className="mt-5 rounded-[34px] border border-[#b8ddc4] bg-white/94 p-6 text-center shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8"><h2 className="text-2xl font-black text-[#14723a]">تم تسجيل اختياركم بالانتظار ✅</h2><p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#526158]">سيتم استكمال الطلب بشكل طبيعي بعد انتهاء المراجعة الداخلية، وسيقوم فريق المتابعة بالتواصل معكم بخصوص موعد التسليم الجديد.</p></section>
        ) : refundRequested ? (
          <section className="mt-5 rounded-[34px] border border-[#e2c984] bg-white/94 p-6 text-center shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8"><h2 className="text-2xl font-black text-[#7c5b13]">تم استلام طلب الاسترداد ✅</h2><p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[#594c2c]">سيتم مراجعة بيانات التحويل المدخلة وتنفيذ استرداد رسوم فتح الملف حسب ترتيب الطلبات.</p></section>
        ) : (
          <section className="mt-5 rounded-[34px] border border-[#d8bd7a] bg-white/94 p-6 shadow-[0_24px_70px_rgba(60,45,20,0.14)] sm:p-8">
            <div className="mb-5 rounded-[28px] border border-[#e7d8bd] bg-[#fffaf1] p-5 text-center"><h2 className="text-2xl font-black text-[#123725]">يرجى اختيار الإجراء المناسب لكم</h2><p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#627064]">تقديرًا لوقتكم، يمكنكم إما انتظار مدة التمديد واستكمال الطلب بشكل طبيعي، أو طلب استرداد رسوم فتح الملف المدفوعة.</p></div>
            <div className="grid gap-5 lg:grid-cols-2">
              <form action="/api/delay-decision" method="POST" className="rounded-[30px] border border-[#b8ddc4] bg-[#edf9f0] p-5"><Hidden app={app} decision="wait" /><h3 className="text-xl font-black text-[#14723a]">الانتظار لمدة 3 أيام عمل</h3><p className="mt-3 text-sm font-bold leading-7 text-[#526158]">أوافق على تمديد موعد التسليم واستكمال الطلب بشكل طبيعي بعد انتهاء المراجعة الداخلية.</p><button type="submit" className="mt-5 w-full rounded-2xl bg-[#37b75d] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-[#2fa553]">أوافق على الانتظار واستكمال الطلب</button></form>
              <form action="/api/delay-decision" method="POST" className="rounded-[30px] border border-[#e2c984] bg-[#fff8e8] p-5"><Hidden app={app} decision="refund" /><h3 className="text-xl font-black text-[#7c5b13]">استرداد رسوم فتح الملف</h3><p className="mt-3 text-sm font-bold leading-7 text-[#594c2c]">في حال عدم الرغبة بالانتظار، يمكنكم تعبئة بيانات التحويل لاسترداد رسوم فتح الملف.</p><Field name="refundAccount" label="رقم المحفظة / اسم كليك المراد التحويل له" placeholder="مثال: 079xxxxxxx أو Alias Click" /><Field name="refundBank" label="نوع المحفظة / البنك" placeholder="مثال: Orange Money / Click / بنك..." /><Field name="refundOwner" label="اسم صاحب الحساب" placeholder="الاسم كما يظهر على المحفظة أو الحساب" /><button type="submit" className="mt-5 w-full rounded-2xl bg-[#123725] px-5 py-4 text-sm font-black text-white shadow-lg transition hover:opacity-90">إرسال طلب الاسترداد</button></form>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function Info({ label, value, gold }: { label: string; value: string; gold?: boolean }) { return <div className={`rounded-[28px] border ${gold ? "border-[#e2c984] bg-[#fff8e8]" : "border-[#eadcc5] bg-white/92"} p-5 shadow-[0_18px_45px_rgba(67,48,20,0.10)]`}><p className={`text-xs font-black ${gold ? "text-[#7c5b13]" : "text-[#818981]"}`}>{label}</p><p className={`mt-2 break-words text-lg font-black ${gold ? "text-[#7c5b13]" : "text-[#123725]"}`}>{value}</p></div>; }
function Hidden({ app, decision }: { app: ApplicationRecord; decision: string }) { return <><input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="tracking" value={app.tracking_id || app.id} /><input type="hidden" name="phone" value={app.phone || ""} /><input type="hidden" name="decision" value={decision} /></>; }
function Field({ name, label, placeholder }: { name: string; label: string; placeholder: string }) { return <label className="mt-4 block"><span className="mb-2 block text-xs font-black text-[#7c5b13]">{label}</span><input required name={name} className="w-full rounded-2xl border border-[#e2c984] bg-white px-4 py-3 text-right text-sm font-bold text-[#123725] outline-none focus:border-[#7c5b13]" placeholder={placeholder} /></label>; }
