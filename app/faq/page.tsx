import Link from "next/link";

const legalRegistrationText =
  "الجهة المالكة والمشغلة للموقع هي Al Ameen for Financial Services، سجل تجاري رقم 728394، والرقم الوطني للمنشأة / الضريبي 102348761، بتاريخ تسجيل 15/03/2025.";

const faqs = [
  {
    question: "هل الأمين للأقساط جهة مسجلة؟",
    answer: legalRegistrationText,
  },
  {
    question: "هل التقديم أونلاين أم داخل مكاتبكم؟",
    answer:
      "التقديم ودراسة الطلب تتم أونلاين فقط. الاستلام من مكاتبنا يكون بعد الموافقة على طلب التمويل وتوقيع العقد.",
  },
  {
    question: "متى يتم شراء الجهاز؟",
    answer:
      "بعد الموافقة على طلب التمويل واستكمال الإجراءات المطلوبة، يتم شراء الجهاز وتجهيزه ثم تسليمه للعميل من مكاتبنا.",
  },
  {
    question: "كم مدة دراسة الطلب؟",
    answer:
      "مدة دراسة الطلب من يوم إلى ثلاثة أيام عمل، أي تقريبًا من 24 إلى 72 ساعة عمل بعد اكتمال البيانات والوثائق ودفع رسوم فتح الملف.",
  },
  {
    question: "هل الدفعة الأولى إجبارية؟",
    answer:
      "لا، الدفعة الأولى اختيارية حسب قدرة العميل. يمكن تقديم طلب بدون دفعة أولى.",
  },
  {
    question: "كم رسوم فتح الملف؟",
    answer:
      "رسوم فتح الملف 5 دنانير أردنية غير مستردة. دفع الرسوم لا يعني الموافقة النهائية على التمويل.",
  },
  {
    question: "ما كفالة أجهزة iPhone؟",
    answer: "أجهزة iPhone تكون بكفالة iSYSTEMS الأردن.",
  },
  {
    question: "ما كفالة أجهزة Samsung؟",
    answer: "أجهزة Samsung تكون بكفالة BMS Samsung حسب الجهاز والتوفر.",
  },
  {
    question: "هل يتم تسليم الجهاز قبل الموافقة؟",
    answer:
      "لا. لا يتم شراء الجهاز أو تسليمه قبل الموافقة على طلب التمويل واستكمال الإجراءات.",
  },
  {
    question: "هل أستطيع تتبع طلبي؟",
    answer:
      "نعم، يمكنك تتبع الطلب من صفحة تتبع الطلب باستخدام رقم الهاتف ورقم التتبع.",
  },
  {
    question: "كيف أتواصل معكم؟",
    answer:
      "يمكنك التواصل معنا من خلال زر واتساب الموجود في الموقع، دون عرض رقم الواتساب كنص عام داخل الصفحات.",
  },
];

export default function FaqPage() {
  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden px-4 py-10 text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[260px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[22%] h-[280px] w-[280px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl">
        <Link
          href="/"
          className="soft-button mb-6 inline-flex rounded-2xl px-4 py-2 text-sm font-black shadow-sm transition"
        >
          الرجوع للرئيسية
        </Link>

        <section className="site-shell pattern-lines rounded-[32px] p-1 shadow-2xl">
          <div className="rounded-[30px] border border-[rgba(214,181,107,0.14)] p-7 sm:p-10">
            <p className="gold-chip mb-4 inline-flex rounded-full px-4 py-2 text-xs font-black">
              الأمين للأقساط والتمويل
            </p>

            <h1 className="text-4xl font-black text-white">الأسئلة الشائعة</h1>

            <p className="mt-5 leading-8 text-[#cbd6cb]">
              إجابات مختصرة على أكثر الأسئلة المتعلقة بالتقديم، التقسيط،
              الكفالات، الاستلام، والجهة المالكة والمشغلة للموقع.
            </p>

            <div className="mt-6 rounded-3xl border border-[rgba(214,181,107,0.18)] bg-[rgba(214,181,107,0.07)] p-5">
              <p className="gold-text mb-2 text-sm font-black">
                بيانات التسجيل والملكية
              </p>

              <p className="text-sm font-bold leading-8 text-[#d7ddd5]">
                {legalRegistrationText}
              </p>
            </div>

            <div className="mt-8 space-y-4">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="glass-panel gold-outline group rounded-3xl p-5"
                >
                  <summary className="cursor-pointer select-none text-lg font-black text-white">
                    {faq.question}
                  </summary>

                  <p className="mt-4 text-sm font-bold leading-8 text-[#d7ddd5]">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                href="/products"
                className="green-button rounded-2xl px-6 py-4 text-center text-sm font-black transition"
              >
                تصفح المنتجات
              </Link>

              <Link
                href="/whatsapp"
                className="soft-button rounded-2xl px-6 py-4 text-center text-sm font-black transition"
              >
                تواصل واتساب
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}