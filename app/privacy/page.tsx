import Link from "next/link";

const companyAddress =
  process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
  "Al-Madina Al-Monawara St 261, Amman 11953";

export default function PrivacyPage() {
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

          <h1 className="text-4xl font-black">سياسة الخصوصية</h1>

          <p className="mt-5 leading-8 text-gray-600">
            نحن في الأمين للأقساط نحترم خصوصية العملاء ونتعامل مع البيانات
            الشخصية والمالية والوثائق المرفوعة بسرية، وتُستخدم فقط لغرض دراسة
            طلب التمويل والتواصل مع العميل بخصوص طلبه.
          </p>

          <div className="mt-8 space-y-6">
            <Section title="1. البيانات التي نجمعها">
              <p>
                قد نقوم بجمع الاسم، رقم الهاتف، البريد الإلكتروني، الرقم الوطني،
                العنوان، معلومات العمل والدخل، بيانات الكفيل، الرقم الوطني
                للكفيل، وصور الوثائق المطلوبة مثل الهوية الشخصية.
              </p>
            </Section>

            <Section title="2. سبب جمع البيانات">
              <p>
                تُستخدم البيانات لغرض دراسة أهلية طلب التقسيط، التحقق من
                المعلومات، متابعة حالة الطلب، التواصل مع العميل، واستكمال
                إجراءات الموافقة والتسليم في حال قبول الطلب.
              </p>
            </Section>

            <Section title="3. الوثائق والصور">
              <p>
                صور الهويات والوثائق المرفوعة تُستخدم فقط للمراجعة الداخلية
                ودراسة الطلب. لا يتم نشرها أو عرضها لأي طرف عام.
              </p>
            </Section>

            <Section title="4. مشاركة البيانات">
              <p>
                لا نقوم ببيع بيانات العملاء. قد تتم مشاركة بعض البيانات فقط عند
                الحاجة مع الجهات أو الأطراف المرتبطة بدراسة الطلب أو استكمال
                إجراءات التمويل والتسليم، وضمن حدود الغرض المطلوب.
              </p>
            </Section>

            <Section title="5. مدة دراسة الطلب">
              <p>
                مدة دراسة الطلب المتوقعة من يوم إلى ثلاثة أيام عمل، أي تقريبًا
                من 24 إلى 72 ساعة عمل بعد اكتمال البيانات والوثائق ودفع رسوم
                فتح الملف.
              </p>
            </Section>

            <Section title="6. أمان البيانات">
              <p>
                نحرص على استخدام وسائل تقنية وتنظيمية مناسبة لحماية البيانات
                من الوصول غير المصرح به أو الاستخدام غير المشروع.
              </p>
            </Section>

            <Section title="7. التواصل">
              <p>
                للتواصل مع الأمين للأقساط، استخدم زر واتساب الموجود في الموقع.
                لا يتم عرض رقم الواتساب كنص عام داخل صفحات الموقع.
              </p>
            </Section>

            <Section title="8. العنوان">
              <p>{companyAddress}</p>
            </Section>
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
    <section className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
      <h2 className="mb-3 text-xl font-black">{title}</h2>
      <div className="text-sm font-bold leading-8 text-gray-600">{children}</div>
    </section>
  );
}