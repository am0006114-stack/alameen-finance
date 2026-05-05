import Link from "next/link";

const companyAddress =
  process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
  "Al-Madina Al-Monawara St 261, Amman 11953";

export default function TermsPage() {
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

          <h1 className="text-4xl font-black">الشروط والأحكام</h1>

          <p className="mt-5 leading-8 text-gray-600">
            باستخدامك لموقع الأمين للأقساط وتقديم طلب تمويل، فإنك تقر بأنك
            قرأت هذه الشروط وتوافق عليها. تقديم الطلب لا يعني الموافقة النهائية
            على التمويل.
          </p>

          <div className="mt-8 space-y-6">
            <Section title="1. طبيعة الخدمة">
              <p>
                الأمين للأقساط يقدم خدمة استقبال ودراسة طلبات تمويل وتقسيط
                الأجهزة إلكترونيًا. جميع خطوات تقديم الطلب ودراسة الملف تتم
                أونلاين، أما الاستلام فيكون من المعرض بعد الموافقة وتوقيع العقد.
              </p>
            </Section>

            <Section title="2. مدة دراسة الطلب">
              <p>
                مدة دراسة الطلب من يوم إلى ثلاثة أيام عمل، أي تقريبًا من 24 إلى
                72 ساعة عمل، وذلك بعد اكتمال البيانات والوثائق المطلوبة ودفع
                رسوم فتح الملف.
              </p>
            </Section>

            <Section title="3. رسوم فتح الملف">
              <p>
                رسوم فتح الملف 5 دنانير أردنية غير مستردة. دفع الرسوم لا يعني
                الموافقة على طلب التمويل، وإنما لاستكمال مراجعة الملف والتقييم
                الأولي.
              </p>
            </Section>

            <Section title="4. شروط الأهلية الأساسية">
              <ul className="list-disc space-y-2 pr-5">
                <li>
                  إذا كان مقدم الطلب مشتركًا بالضمان، يجب ألا يقل الراتب الصافي
                  عن 350 دينار أردني.
                </li>
                <li>
                  إذا كان مقدم الطلب غير مشترك بالضمان، يجب ألا يقل الراتب
                  الصافي عن 400 دينار أردني.
                </li>
                <li>
                  في حال عدم اشتراك مقدم الطلب بالضمان، يجب أن يكون الكفيل
                  مشتركًا بالضمان الاجتماعي ومن صلة قرابة مقبولة حسب سياسة
                  المعرض.
                </li>
                <li>
                  يجب تقديم بيانات صحيحة ووثائق واضحة لمقدم الطلب والكفيل.
                </li>
              </ul>
            </Section>

            <Section title="5. الدفعة الأولى والتقسيط">
              <p>
                الدفعة الأولى اختيارية حسب قدرة العميل، ويمكن تقديم طلب بدون
                دفعة أولى. القسط الشهري الظاهر في الموقع تقريبي قبل دراسة الطلب
                والموافقة النهائية.
              </p>
            </Section>

            <Section title="6. شراء وتسليم الجهاز">
              <p>
                لا يتم شراء الجهاز أو تجهيزه للتسليم إلا بعد الموافقة على طلب
                التمويل واستكمال الإجراءات المطلوبة. بعد الموافقة، يتم شراء
                الجهاز وتسليمه للعميل من المعرض مع توقيع العقد.
              </p>
            </Section>

            <Section title="7. الكفالات">
              <p>
                أجهزة iPhone تكون بكفالة iSYSTEMS الأردن. أجهزة Samsung تكون
                بكفالة BMS Samsung حسب الجهاز والتوفر.
              </p>
            </Section>

            <Section title="8. رفض أو إلغاء الطلب">
              <p>
                يحق للإدارة رفض أو إلغاء أي طلب في حال وجود نقص في البيانات،
                معلومات غير صحيحة، عدم مطابقة الشروط، عدم دفع رسوم فتح الملف،
                أو لأي سبب متعلق بتقييم المخاطر والقدرة على السداد.
              </p>
            </Section>

            <Section title="9. العنوان">
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