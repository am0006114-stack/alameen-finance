import Link from "next/link";

const companyAddress =
  process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
  "Al-Madina Al-Monawara St 261, Amman 11953";

const legalRegistrationText =
  "الجهة المالكة والمشغلة للموقع هي Al Ameen for Financial Services، سجل تجاري رقم 728394، والرقم الوطني للمنشأة / الضريبي 102348761، بتاريخ تسجيل 15/03/2025.";

export default function TermsPage() {
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

            <h1 className="text-4xl font-black text-white">الشروط والأحكام</h1>

            <p className="mt-5 leading-8 text-[#cbd6cb]">
              باستخدامك لموقع الأمين للأقساط وتقديم طلب تمويل، فإنك تقر بأنك
              قرأت هذه الشروط وتوافق عليها. تقديم الطلب لا يعني الموافقة النهائية
              على التمويل.
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

              <Section title="2. طبيعة الخدمة">
                <p>
                  الأمين للأقساط يقدم خدمة استقبال ودراسة طلبات تمويل وتقسيط
                  الأجهزة إلكترونيًا. جميع خطوات تقديم الطلب ودراسة الملف تتم
                  أونلاين، أما الاستلام فيكون من مكاتبنا بعد الموافقة وتوقيع
                  العقد.
                </p>
              </Section>

              <Section title="3. مدة دراسة الطلب">
                <p>
                  مدة دراسة الطلب من يوم إلى ثلاثة أيام عمل، أي تقريبًا من 24 إلى
                  72 ساعة عمل، وذلك بعد اكتمال البيانات والوثائق المطلوبة ودفع
                  رسوم فتح الملف.
                </p>
              </Section>

              <Section title="4. رسوم فتح الملف">
                <p>
                  رسوم فتح الملف 5 دنانير أردنية غير مستردة. دفع الرسوم لا يعني
                  الموافقة على طلب التمويل، وإنما لاستكمال مراجعة الملف والتقييم
                  الأولي.
                </p>
              </Section>

              <Section title="5. شروط الأهلية الأساسية">
                <ul className="list-disc space-y-2 pr-5">
                  <li>
                    إذا كان مقدم الطلب مشتركًا بالضمان، يجب ألا يقل الراتب
                    الصافي عن 350 دينار أردني.
                  </li>
                  <li>
                    إذا كان مقدم الطلب غير مشترك بالضمان، يجب ألا يقل الراتب
                    الصافي عن 400 دينار أردني.
                  </li>
                  <li>
                    في حال عدم اشتراك مقدم الطلب بالضمان، يجب أن يكون الكفيل
                    مشتركًا بالضمان الاجتماعي ومن صلة قرابة مقبولة حسب سياسة
                    الأمين.
                  </li>
                  <li>
                    يجب تقديم بيانات صحيحة ووثائق واضحة لمقدم الطلب والكفيل.
                  </li>
                </ul>
              </Section>

              <Section title="6. الدفعة الأولى والتقسيط">
                <p>
                  الدفعة الأولى اختيارية حسب قدرة العميل، ويمكن تقديم طلب بدون
                  دفعة أولى. القسط الشهري الظاهر في الموقع تقريبي قبل دراسة الطلب
                  والموافقة النهائية.
                </p>
              </Section>

              <Section title="7. شراء وتسليم الجهاز">
                <p>
                  لا يتم شراء الجهاز أو تجهيزه للتسليم إلا بعد الموافقة على طلب
                  التمويل واستكمال الإجراءات المطلوبة. بعد الموافقة، يتم شراء
                  الجهاز وتسليمه للعميل من مكاتبنا مع توقيع العقد.
                </p>
              </Section>

              <Section title="8. الكفالات">
                <p>
                  أجهزة iPhone تكون بكفالة iSYSTEMS الأردن. أجهزة Samsung تكون
                  بكفالة BMS Samsung حسب الجهاز والتوفر.
                </p>
              </Section>

              <Section title="9. رفض أو إلغاء الطلب">
                <p>
                  يحق للإدارة رفض أو إلغاء أي طلب في حال وجود نقص في البيانات،
                  معلومات غير صحيحة، عدم مطابقة الشروط، عدم دفع رسوم فتح الملف،
                  أو لأي سبب متعلق بتقييم المخاطر والقدرة على السداد.
                </p>
              </Section>

              <Section title="10. العنوان">
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