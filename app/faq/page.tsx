import Link from "next/link";

const faqs = [
  {
    question: "هل التقديم أونلاين أم داخل المعرض؟",
    answer:
      "التقديم ودراسة الطلب تتم أونلاين فقط. الاستلام من المعرض يكون بعد الموافقة على طلب التمويل وتوقيع العقد.",
  },
  {
    question: "متى يتم شراء الجهاز؟",
    answer:
      "بعد الموافقة على طلب التمويل واستكمال الإجراءات المطلوبة، يتم شراء الجهاز وتجهيزه ثم تسليمه للعميل من المعرض.",
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
    <main dir="rtl" className="min-h-screen bg-[#f6f3ee] px-4 py-10 text-[#111827]">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="mb-6 inline-flex rounded-2xl border border-[#eadfce] bg-white px-4 py-2 text-sm font-black text-gray-700 shadow-sm"
        >
          الرجوع للرئيسية
        </Link>

        <section className="rounded-[32px] border border-[#eadfce] bg-white p-7 shadow-xl sm:p-10">
          <p className="mb-3 text-sm font-black text-[#b28b5e]">
            الأمين للأقساط
          </p>

          <h1 className="text-4xl font-black">الأسئلة الشائعة</h1>

          <p className="mt-5 leading-8 text-gray-600">
            إجابات مختصرة على أكثر الأسئلة المتعلقة بالتقديم، التقسيط،
            الكفالات، والاستلام.
          </p>

          <div className="mt-8 space-y-4">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-3xl border border-gray-100 bg-gray-50 p-5"
              >
                <summary className="cursor-pointer select-none text-lg font-black text-[#111827]">
                  {faq.question}
                </summary>

                <p className="mt-4 text-sm font-bold leading-8 text-gray-600">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link
              href="/products"
              className="rounded-2xl bg-[#111827] px-6 py-4 text-center text-sm font-black text-white"
            >
              تصفح المنتجات
            </Link>

            <Link
              href="/whatsapp"
              className="rounded-2xl border border-[#eadfce] bg-white px-6 py-4 text-center text-sm font-black text-gray-700"
            >
              تواصل واتساب
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}