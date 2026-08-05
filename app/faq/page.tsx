import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/site/MobileBottomNav";
import { ArrowIcon, ShieldIcon } from "@/components/site/UiIcons";

const faqs = [
  {
    question: "ما طبيعة الأمين للأقساط؟",
    answer:
      "الأمين للأقساط جهة مستقلة لتقسيط الأجهزة الإلكترونية والهواتف. ليست بنكًا ولا شركة تمويل أو إقراض، ولا تمنح قروضًا، ولا توجد أي علاقة أو شراكة أو تبعية بينها وبين شركة الأمين للتمويل الأصغر.",
  },
  {
    question: "كيف أبدأ الطلب؟",
    answer:
      "ابدأ من صفحة الأجهزة واختر الجهاز والمدة والدفعة الأولى المناسبة. لا يمكن إنشاء طلب جديد دون اختيار جهاز محدد.",
  },
  {
    question: "هل الدفعة الأولى إجبارية؟",
    answer:
      "لا. الدفعة الأولى اختيارية، ويمكنك تركها صفرًا. القسط الظاهر في الموقع تقديري ويعاد احتسابه حسب السعر والمدة والدفعة الأولى.",
  },
  {
    question: "كم رسوم فتح الملف؟",
    answer:
      "رسوم فتح الملف 5 دنانير فقط، وليست دفعة من ثمن الجهاز أو قسطًا أولًا. تكون مستردة في حال عدم صدور الموافقة النهائية وفق حالة الطلب وإجراءات الاسترداد المعتمدة.",
  },
  {
    question: "أين أرفع الهوية أو كشف الراتب؟",
    answer:
      "الهوية وكشف الراتب وبيانات الكفيل وأي مستند حساس تُرفع فقط من الرابط الرسمي الآمن المرتبط بالطلب. لا تُرسل عبر واتساب ولا تُسلّم بالحضور دون طلب أو موعد رسمي.",
  },
  {
    question: "كم تستغرق دراسة الطلب؟",
    answer:
      "المدة المعتمدة عادة من يومين إلى 3 أيام عمل بعد اكتمال المتطلبات، والجمعة والسبت لا تُحسبان. قد تتأخر بعض الحالات بسبب ضغط المراجعات أو الظروف التشغيلية الاستثنائية دون وعد بموعد غير مؤكد.",
  },
  {
    question: "هل تقديم الطلب يعني الموافقة؟",
    answer:
      "لا. تقديم الطلب أو التأهيل المبدئي لا يعني الموافقة النهائية. كل مرحلة تظهر باسمها الفعلي داخل صفحة التتبع.",
  },
  {
    question: "كيف أتابع الطلب؟",
    answer:
      "استخدم صفحة تتبع الطلب برقم الهاتف ورقم التتبع، أو تابع من خلال محادثة واتساب المرتبطة بطلبك. الرد يكون حسب الدور وضغط المراجعات.",
  },
  {
    question: "كيف يتم التسليم؟",
    answer:
      "التسليم من المكتب فقط وبموعد رسمي بعد الموافقة النهائية وجاهزية الجهاز. لا يوجد توصيل، ولا يُذكر عنوان المكتب قبل الموافقة أو إرسال الموعد الرسمي.",
  },
];

export default function FaqPage() {
  return (
    <main dir="rtl" className="v2-page v2-legal-page">
      <SiteHeader active="faq" />
      <section className="v2-legal-hero">
        <div className="v2-container">
          <span>معلومات واضحة</span>
          <h1>الأسئلة الشائعة</h1>
          <p>إجابات مباشرة عن اختيار الجهاز، التقديم، رسوم فتح الملف، المستندات، المتابعة والتسليم.</p>
        </div>
      </section>

      <section className="v2-container v2-legal-layout">
        <aside className="v2-legal-aside">
          <ShieldIcon size={30} />
          <h2>قبل ما تبدأ</h2>
          <p>اختر الجهاز أولًا، ولا ترسل أي مستند حساس عبر واتساب. استخدم الرابط الرسمي المرتبط بطلبك فقط.</p>
          <Link href="/products" className="v2-button v2-button-primary">اختر جهازك <ArrowIcon size={17}/></Link>
        </aside>

        <div className="v2-legal-content v2-faq-list">
          {faqs.map((faq, index) => (
            <details key={faq.question} open={index === 0}>
              <summary>{faq.question}<span>+</span></summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
      <SiteFooter />
      <MobileBottomNav />
    </main>
  );
}
