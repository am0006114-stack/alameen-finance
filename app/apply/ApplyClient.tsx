"use client";

import Link from "next/link";

const maintenanceMessage =
  "نعتذر، تم إيقاف استقبال الطلبات الجديدة مؤقتًا بسبب صيانة عاجلة للأنظمة. متابعة الطلبات الحالية مستمرة وسيتم الرد على جميع الطلبات القائمة بحد أقصى يوم الاثنين. خدمة تتبع الطلبات ما زالت متاحة بشكل طبيعي.";

export default function ApplyPage() {
  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden px-4 py-10 text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-red-500/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[260px] h-[300px] w-[300px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[22%] h-[280px] w-[280px] rounded-full bg-[#3fae65]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
        <section className="site-shell pattern-lines w-full overflow-hidden rounded-[34px] p-1 shadow-2xl">
          <div className="rounded-[32px] border border-red-400/30 bg-[linear-gradient(135deg,rgba(127,29,29,0.36),rgba(3,18,14,0.92),rgba(214,181,107,0.08))] px-6 py-9 text-center sm:px-10 sm:py-12">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-red-300/30 bg-red-950/35 text-3xl font-black text-red-100 shadow-[0_18px_50px_rgba(127,29,29,0.24)]">
              !
            </div>

            <p className="gold-chip mx-auto mb-5 inline-flex rounded-full px-4 py-2 text-xs font-black">
              صيانة عاجلة للأنظمة
            </p>

            <h1 className="text-3xl font-black leading-tight text-white sm:text-5xl">
              استقبال الطلبات الجديدة متوقف مؤقتًا
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base font-bold leading-9 text-[#f7d6d6] sm:text-lg">
              {maintenanceMessage}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                href="/track"
                className="green-button rounded-2xl px-6 py-4 text-center text-base font-black transition"
              >
                تتبع طلبك الحالي
              </Link>

              <Link
                href="/"
                className="soft-button rounded-2xl px-6 py-4 text-center text-base font-black transition"
              >
                الرجوع للرئيسية
              </Link>
            </div>

            <div className="mt-8 rounded-3xl border border-[rgba(214,181,107,0.24)] bg-[rgba(3,18,14,0.58)] p-5 text-right">
              <p className="text-sm font-black text-[#f3dfac]">ملاحظة مهمة</p>
              <p className="mt-2 text-sm font-bold leading-8 text-[#d7ddd5]">
                لا يوجد أي إجراء مطلوب من العملاء أصحاب الطلبات القائمة الآن. يرجى استخدام صفحة التتبع فقط لمعرفة آخر حالة للطلب، وسيتم متابعة الملفات الحالية بحد أقصى يوم الاثنين.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
