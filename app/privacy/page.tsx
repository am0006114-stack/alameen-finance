import Link from "next/link";

const companyAddress =
  process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
  "Al-Madina Al-Monawara St 261, Amman 11953";

const legalRegistrationText =
  "الجهة المالكة والمشغلة للموقع هي Al Ameen for Financial Services، سجل تجاري رقم 728394، والرقم الوطني للمنشأة / الضريبي 102348761، بتاريخ تسجيل 15/03/2025.";

export default function PrivacyPage() {
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

            <h1 className="text-4xl font-black text-white">سياسة الخصوصية</h1>

            <p className="mt-5 leading-8 text-[#cbd6cb]">
              نحن في الأمين للأقساط نحترم خصوصية العملاء ونتعامل مع البيانات
              الشخصية والمالية والوثائق المرفوعة بسرية، وتُستخدم فقط لغرض دراسة
              طلب التمويل والتواصل مع العميل بخصوص طلبه.
            </p>

            <div className="mt-6 rounded-3xl border border-[rgba(214,181,107,0.18)] bg-[rgba(214,181,107,0.07)] p-5">
              <p className="gold-text mb-2 text-sm font-black">
                بيانات الجهة المالكة والمشغلة
              </p>

              <p className="text-sm font-bold leading-8 text-[#d7ddd5]">
                {legalRegistrationText}
              </p>
            </div>

            <div className="mt-8 space-y-6">
              <Section title="1. الجهة المالكة والمشغلة">
                <p>{legalRegistrationText}</p>
              </Section>

              <Section title="2. البيانات التي نجمعها">
                <p>
                  قد نقوم بجمع الاسم، رقم الهاتف، البريد الإلكتروني، الرقم
                  الوطني، العنوان، معلومات العمل والدخل، بيانات الكفيل، الرقم
                  الوطني للكفيل، وصور الوثائق المطلوبة مثل الهوية الشخصية وأي
                  مستندات إضافية لازمة لدراسة الطلب مثل كشف الراتب أو شهادة
                  الراتب.
                </p>
              </Section>

              <Section title="3. سبب جمع البيانات">
                <p>
                  تُستخدم البيانات لغرض دراسة أهلية طلب التقسيط، التحقق من
                  المعلومات، متابعة حالة الطلب، التواصل مع العميل، واستكمال
                  إجراءات الموافقة والتسليم في حال قبول الطلب.
                </p>
              </Section>

              <Section title="4. الوثائق والصور">
                <p>
                  صور الهويات والوثائق المرفوعة تُستخدم فقط للمراجعة الداخلية
                  ودراسة الطلب. لا يتم نشرها أو عرضها لأي طرف عام، ولا تُستخدم
                  لأغراض تسويقية أو إعلانية.
                </p>
              </Section>

              <Section title="5. مشاركة البيانات">
                <p>
                  لا نقوم ببيع بيانات العملاء. قد تتم مشاركة بعض البيانات فقط
                  عند الحاجة مع الجهات أو الأطراف المرتبطة بدراسة الطلب أو
                  استكمال إجراءات التمويل والتسليم، وضمن حدود الغرض المطلوب.
                </p>
              </Section>

              <Section title="6. مدة دراسة الطلب">
                <p>
                  مدة دراسة الطلب المتوقعة من يوم إلى ثلاثة أيام عمل، أي تقريبًا
                  من 24 إلى 72 ساعة عمل بعد اكتمال البيانات والوثائق ودفع رسوم
                  فتح الملف.
                </p>
              </Section>

              <Section title="7. أمان البيانات">
                <p>
                  نحرص على استخدام وسائل تقنية وتنظيمية مناسبة لحماية البيانات
                  من الوصول غير المصرح به أو الاستخدام غير المشروع، ويقتصر
                  الوصول إلى بيانات الطلبات على الأشخاص المخولين بمراجعة الطلبات
                  فقط.
                </p>
              </Section>

              <Section title="8. رقم الهاتف والتواصل">
                <p>
                  للتواصل مع الأمين للأقساط، استخدم زر واتساب الموجود في الموقع.
                  لا يتم عرض رقم الواتساب كنص عام داخل صفحات الموقع، وذلك لتقليل
                  جمع الرقم آليًا من محركات البحث أو أدوات الفهرسة.
                </p>
              </Section>

              <Section title="9. العنوان">
                <p>{companyAddress}</p>
              </Section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel gold-outline rounded-3xl p-5">
      <h2 className="gold-text mb-3 text-xl font-black">{title}</h2>
      <div className="text-sm font-bold leading-8 text-[#d7ddd5]">
        {children}
      </div>
    </section>
  );
}