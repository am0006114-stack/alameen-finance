import Image from "next/image";
import Link from "next/link";

const legalRegistrationText =
  "الجهة المالكة والمشغلة للموقع هي Al Ameen for Financial Services، سجل تجاري رقم 728394، والرقم الوطني للمنشأة / الضريبي 102348761، بتاريخ تسجيل 15/03/2025.";

const featuredBenefits = [
  {
    title: "تقديم أونلاين بالكامل",
    description: "قدّم طلبك من البيت خلال دقائق بدون زيارة أولية لمكاتبنا.",
  },
  {
    title: "دراسة خلال 24 - 72 ساعة",
    description: "بعد اكتمال البيانات والوثائق ودفع رسوم فتح الملف.",
  },
  {
    title: "دفعة أولى اختيارية",
    description: "يمكنك اختيار دفعة أولى حسب قدرتك أو التقديم بدون دفعة.",
  },
  {
    title: "استلام من المعرض / المكاتب",
    description: "بعد الموافقة، يتم شراء الجهاز وتسليمه مع توقيع العقد.",
  },
];

const steps = [
  ["1", "اختر الجهاز", "تصفح أجهزة iPhone و Samsung واختر الأنسب لك."],
  ["2", "قدّم الطلب", "عبّئ البيانات وارفع صور الهويات المطلوبة."],
  ["3", "ادفع رسوم الملف", "ادفع 5 دنانير وأدخل رقم الوصل أو رقم الحركة."],
  ["4", "انتظر الدراسة", "تتم مراجعة الطلب خلال 24 إلى 72 ساعة عمل."],
  ["5", "استلم جهازك", "بعد الموافقة، يتم شراء الجهاز وتسليمه مع توقيع العقد."],
];

const faqItems = [
  "هل التقديم أونلاين؟ نعم، التقديم ودراسة الطلب تتم أونلاين فقط.",
  "كم مدة دراسة الطلب؟ من 24 إلى 72 ساعة عمل بعد اكتمال البيانات.",
  "هل الدفعة الأولى إجبارية؟ لا، الدفعة الأولى اختيارية حسب قدرة العميل.",
  "متى يتم شراء الجهاز؟ بعد الموافقة على طلب التمويل واستكمال الإجراءات.",
];

const featuredPhones = [
  {
    name: "iPhone 16 Pro",
    price: "839 د.أ",
    image: "/assets/iphone16pro.jpg",
    href: "/products",
    badge: "iSYSTEMS",
  },
  {
    name: "iPhone 16 Pro Max",
    price: "999 د.أ",
    image: "/assets/iphone16promax.jpg",
    href: "/products",
    badge: "iSYSTEMS",
  },
  {
    name: "S26 Ultra 5G",
    price: "969 د.أ",
    image: "/assets/s26ultra.jpg",
    href: "/products",
    badge: "BMS Samsung",
  },
];

export default function HomePage() {
  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-100px] top-[220px] h-[260px] w-[260px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[18%] h-[260px] w-[260px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-[rgba(214,181,107,0.18)] bg-[rgba(2,18,14,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.2)] bg-[rgba(255,255,255,0.04)] shadow-lg sm:h-14 sm:w-14">
              <Image
                src="/logo.png"
                alt="الأمين للأقساط"
                fill
                priority
                sizes="56px"
                className="object-contain p-1"
              />
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-black leading-6 text-white sm:text-lg">
                الأمين للأقساط
              </p>
              <p className="gold-text truncate text-[11px] font-black tracking-wide sm:text-xs">
                AL AMEEN FINANCE
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-[#d7ddd5] lg:flex">
            <Link href="/" className="text-white">
              الرئيسية
            </Link>
            <Link href="/products" className="hover:text-white">
              تصفح الهواتف
            </Link>
            <Link href="/track" className="hover:text-white">
              تتبع الطلب
            </Link>
            <Link href="/faq" className="hover:text-white">
              الأسئلة الشائعة
            </Link>
            <Link href="/terms" className="hover:text-white">
              الشروط
            </Link>
            <Link href="/privacy" className="hover:text-white">
              الخصوصية
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/whatsapp"
              className="soft-button hidden rounded-2xl px-4 py-3 text-sm font-black shadow-lg transition sm:inline-flex"
            >
              واتساب
            </Link>

            <Link
              href="/products"
              className="green-button rounded-2xl px-4 py-3 text-xs font-black shadow-xl transition sm:px-5 sm:text-sm"
            >
              تصفح الهواتف
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pt-6 sm:pt-8 lg:pt-10">
        <div className="site-shell pattern-lines overflow-hidden rounded-[32px] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:rounded-[42px]">
          <div className="relative overflow-hidden rounded-[30px] border border-[rgba(214,181,107,0.14)] px-5 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(214,181,107,0.08),transparent_24%),radial-gradient(circle_at_85%_12%,rgba(84,199,116,0.08),transparent_24%),linear-gradient(135deg,transparent,rgba(214,181,107,0.04),transparent)]" />

            <div className="relative grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
              <div>
                <p className="gold-chip mb-5 inline-flex max-w-full rounded-full px-4 py-2 text-xs font-black leading-6 sm:text-sm">
                  iPhone و Samsung بالأقساط… بطريقة تليق فيك
                </p>

                <h1 className="max-w-full text-3xl font-black leading-[1.35] tracking-tight text-white sm:text-5xl sm:leading-[1.25] lg:text-6xl">
                  تجربة متكاملة،
                  <br />
                  <span className="gold-text">ثقة بكل خطوة</span>
                </h1>

                <p className="mt-5 max-w-3xl text-sm font-bold leading-8 text-[#d3ddd3] sm:text-lg sm:leading-9">
                  اختر جهاز <span dir="ltr">iPhone</span> أو{" "}
                  <span dir="ltr">Samsung</span>، وقدّم طلبك أونلاين خلال دقائق.
                  نحافظ على تجربة فاخرة وواضحة من أول خطوة حتى المتابعة والاستلام.
                </p>

                <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
                  <Link
                    href="/products"
                    className="green-button rounded-2xl px-7 py-4 text-center text-base font-black transition"
                  >
                    تصفح الهواتف
                  </Link>

                  <Link
                    href="/apply"
                    className="gold-button rounded-2xl px-7 py-4 text-center text-base font-black transition"
                  >
                    قدّم الآن
                  </Link>

                  <Link
                    href="/track"
                    className="soft-button rounded-2xl px-7 py-4 text-center text-base font-black transition"
                  >
                    تتبع الطلب
                  </Link>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <TrustPill value="حتى 36" label="شهر تقسيط" />
                  <TrustPill value="5%" label="لكل 12 شهر" />
                  <TrustPill value="24-72" label="ساعة عمل للدراسة" />
                  <TrustPill value="5 د.أ" label="رسوم فتح الملف" />
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="absolute right-10 top-8 h-40 w-40 rounded-full bg-[#d6b56b]/10 blur-3xl" />
                <div className="absolute left-8 bottom-10 h-40 w-40 rounded-full bg-[#58c07f]/10 blur-3xl" />

                <div className="grid gap-4">
                  <div className="glass-panel rounded-[34px] p-4">
                    <div className="grid grid-cols-[1.1fr_0.9fr] gap-4">
                      <HeroShowcasePhone
                        image="/assets/iphone16promax.jpg"
                        title="iPhone 16 Pro Max"
                        subtitle="Premium"
                        price="999 د.أ"
                      />

                      <div className="flex flex-col gap-3">
                        <MiniInfoCard title="دراسة الطلب" value="24 - 72 ساعة" />
                        <MiniInfoCard title="دفعة أولى" value="اختيارية" />
                        <MiniInfoCard title="الاستلام" value="بعد الموافقة" />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="glass-panel rounded-[28px] p-4">
                      <p className="gold-text text-sm font-black">منتج مختار</p>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="relative h-24 w-24 overflow-hidden rounded-3xl border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.03)]">
                          <Image
                            src="/assets/iphone16pro.jpg"
                            alt="iPhone 16 Pro"
                            fill
                            sizes="96px"
                            className="object-contain p-2"
                          />
                        </div>
                        <div>
                          <p className="text-lg font-black text-white">iPhone 16 Pro</p>
                          <p className="mt-1 text-sm font-bold text-[#d0d9d0]">
                            كفالة iSYSTEMS
                          </p>
                          <p className="mt-2 text-xl font-black text-[#69d97b]">
                            839 د.أ
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="glass-panel rounded-[28px] p-4">
                      <p className="gold-text text-sm font-black">ثقة ومصداقية</p>
                      <div className="mt-4 space-y-3 text-sm font-bold leading-7 text-[#d7ddd5]">
                        <p>✓ متابعة حالة الطلب برقم التتبع</p>
                        <p>✓ شروط واضحة وتجربة سهلة</p>
                        <p>✓ حماية للبيانات والوثائق</p>
                        <p>✓ واجهة احترافية وواضحة</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="gold-text mb-2 text-sm font-black">أجهزة مختارة</p>
            <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
              ابدأ من الأجهزة الأكثر طلبًا
            </h2>
          </div>

          <Link
            href="/products"
            className="gold-button hidden rounded-2xl px-5 py-3 text-sm font-black shadow-lg transition sm:inline-flex"
          >
            عرض كل الأجهزة
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {featuredPhones.map((phone) => (
            <Link
              key={phone.name}
              href={phone.href}
              className="glass-panel gold-outline overflow-hidden rounded-[24px] transition hover:-translate-y-1 hover:shadow-2xl sm:rounded-[28px]"
            >
              <div className="relative h-44 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] sm:h-64">
                <Image
                  src={phone.image}
                  alt={phone.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-contain p-3 sm:p-4"
                />
              </div>

              <div className="border-t border-[rgba(214,181,107,0.14)] p-3 sm:p-4">
                <p className="gold-text text-[11px] font-black sm:text-xs">{phone.badge}</p>
                <h3 className="mt-2 min-h-[42px] text-sm font-black leading-6 text-white sm:min-h-[48px] sm:text-xl">
                  {phone.name}
                </h3>
                <p className="mt-3 text-base font-black text-[#69d97b] sm:text-lg">
                  {phone.price}
                </p>
                <p className="mt-1 text-[11px] font-bold leading-5 text-[#afbbaf] sm:text-xs">
                  السعر النقدي قبل احتساب التقسيط
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-5 sm:hidden">
          <Link
            href="/products"
            className="gold-button block rounded-2xl px-5 py-4 text-center text-sm font-black shadow-lg"
          >
            عرض كل الأجهزة
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:py-6">
        <div className="grid gap-4 md:grid-cols-4">
          {featuredBenefits.map((benefit, index) => (
            <div
              key={benefit.title}
              className="glass-panel gold-outline rounded-[28px] p-6 transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(214,181,107,0.24)] bg-[rgba(214,181,107,0.08)] text-sm font-black text-[#f3dfac]">
                {index + 1}
              </div>
              <h3 className="text-lg font-black text-white">{benefit.title}</h3>
              <p className="mt-3 text-sm font-medium leading-7 text-[#c3cec2]">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="site-shell rounded-[30px] p-1 sm:rounded-[40px]">
          <div className="rounded-[28px] px-6 py-7 sm:rounded-[38px] sm:px-10 sm:py-10">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="gold-text mb-3 text-sm font-black">خطوات واضحة</p>
                <h2 className="text-3xl font-black text-white sm:text-4xl">
                  كيف تعمل الخدمة؟
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-medium leading-8 text-[#c0ccc0]">
                  من اختيار الجهاز حتى الاستلام، كل خطوة واضحة ومتابعة من خلال رقم التتبع.
                </p>
              </div>

              <Link
                href="/faq"
                className="soft-button rounded-2xl px-5 py-3 text-center text-sm font-black transition"
              >
                عرض الأسئلة الشائعة
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              {steps.map((step) => (
                <div
                  key={step[0]}
                  className="glass-panel gold-outline rounded-[28px] p-5 text-center"
                >
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(214,181,107,0.26)] bg-[rgba(214,181,107,0.1)] text-lg font-black text-[#f3dfac]">
                    {step[0]}
                  </div>
                  <h3 className="text-lg font-black text-white">{step[1]}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-[#c0ccc0]">
                    {step[2]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass-panel-strong rounded-[30px] p-7 shadow-2xl sm:rounded-[40px] sm:p-10">
            <p className="gold-text mb-3 text-sm font-black">كفالات معتمدة</p>

            <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl">
              أجهزة أصلية، وكفالة واضحة
            </h2>

            <div className="mt-8 grid gap-4">
              <WarrantyItem title="أجهزة iPhone" value="كفالة iSYSTEMS الأردن" />
              <WarrantyItem
                title="أجهزة Samsung"
                value="كفالة BMS Samsung حسب الجهاز والتوفر"
              />
              <WarrantyItem
                title="التسليم"
                value="من المعرض / المكاتب بعد الموافقة وتوقيع العقد"
              />
            </div>
          </div>

          <div className="glass-panel rounded-[30px] p-7 shadow-xl sm:rounded-[40px] sm:p-10">
            <p className="gold-text mb-3 text-sm font-black">شروط مختصرة</p>

            <h2 className="text-3xl font-black text-white">الأهلية الأساسية</h2>

            <div className="mt-6 space-y-3 text-sm font-bold leading-8 text-[#c9d2c8]">
              <p>✓ للمشتركين بالضمان: الراتب الصافي لا يقل عن 350 د.أ.</p>
              <p>✓ لغير المشتركين بالضمان: الراتب لا يقل عن 400 د.أ مع كفيل مشترك بالضمان.</p>
              <p>✓ وجود كفيل ورفع صور الهوية المطلوبة لمقدم الطلب والكفيل.</p>
              <p>✓ عدم وجود قضايا مالية مؤثرة حسب سياسة دراسة الطلب.</p>
              <p>✓ الموافقة النهائية بعد مراجعة الإدارة وتوقيع العقد.</p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Link
                href="/terms"
                className="green-button rounded-2xl px-5 py-4 text-center text-sm font-black transition"
              >
                قراءة الشروط
              </Link>

              <Link
                href="/privacy"
                className="soft-button rounded-2xl px-5 py-4 text-center text-sm font-black transition"
              >
                سياسة الخصوصية
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="glass-panel rounded-[30px] p-6 shadow-xl sm:rounded-[40px] sm:p-10">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="gold-text mb-3 text-sm font-black">أسئلة شائعة</p>
              <h2 className="text-3xl font-black text-white">قبل ما تقدّم</h2>
            </div>

            <Link
              href="/faq"
              className="gold-button rounded-2xl px-5 py-3 text-center text-sm font-black shadow-lg transition"
            >
              كل الأسئلة
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {faqItems.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.03)] p-5 text-sm font-bold leading-8 text-[#d7ddd5]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="glass-panel-strong rounded-[30px] overflow-hidden shadow-2xl sm:rounded-[40px]">
          <div className="grid gap-6 p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="gold-text mb-3 text-sm font-black">ابدأ الآن</p>

              <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl">
                جاهز تختار جهازك؟
              </h2>

              <p className="mt-3 max-w-2xl text-sm font-medium leading-8 text-[#c7d2c7]">
                تصفح الهواتف، اختر مدة التقسيط والدفعة الأولى، ثم أرسل الطلب بخطوات واضحة وآمنة.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/products"
                className="gold-button rounded-2xl px-7 py-4 text-center text-base font-black transition"
              >
                تصفح الهواتف
              </Link>

              <Link
                href="/track"
                className="soft-button rounded-2xl px-7 py-4 text-center text-base font-black transition"
              >
                تتبع الطلب
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[rgba(214,181,107,0.16)] bg-[rgba(2,18,14,0.55)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto] md:items-start">
          <div className="flex items-start gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.04)] shadow-sm">
              <Image
                src="/logo.png"
                alt="الأمين للأقساط"
                fill
                sizes="48px"
                className="object-contain p-1"
              />
            </div>

            <div>
              <p className="font-black text-white">الأمين للأقساط</p>
              <p className="mt-1 text-xs font-bold text-[#c7d3c7]">
                التقديم أونلاين فقط، والاستلام بعد الموافقة واستكمال الإجراءات.
              </p>
              <p className="mt-1 text-xs font-bold text-[#a7b4a7]">
                شارع المدينة المنورة 261، عمّان 11953، الأردن
              </p>

              <div className="mt-4 max-w-3xl rounded-2xl border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.04)] p-4">
                <p className="gold-text text-xs font-black">بيانات التسجيل والملكية</p>
                <p className="mt-2 text-xs font-bold leading-7 text-[#d2dad2]">
                  {legalRegistrationText}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm font-bold text-[#c2cec2]">
            <Link href="/products">الهواتف</Link>
            <Link href="/track">تتبع الطلب</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/terms">الشروط</Link>
            <Link href="/privacy">الخصوصية</Link>
            <Link href="/whatsapp">واتساب</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function TrustPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-chip rounded-2xl p-4">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#b9c6b9]">{label}</p>
    </div>
  );
}

function MiniInfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.03)] p-4">
      <p className="text-xs font-black text-[#b6c4b7]">{title}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function HeroShowcasePhone({
  image,
  title,
  subtitle,
  price,
}: {
  image: string;
  title: string;
  subtitle: string;
  price: string;
}) {
  return (
    <div className="rounded-[28px] border border-[rgba(214,181,107,0.18)] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="relative h-72 overflow-hidden rounded-[24px] border border-[rgba(214,181,107,0.14)] bg-[rgba(255,255,255,0.02)]">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(max-width: 1024px) 50vw, 420px"
          className="object-contain p-5"
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xl font-black text-white">{title}</p>
          <p className="mt-1 text-sm font-bold text-[#b6c3b6]">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-[rgba(214,181,107,0.2)] bg-[rgba(214,181,107,0.08)] px-4 py-3">
          <p className="text-lg font-black text-[#f3dfac]">{price}</p>
        </div>
      </div>
    </div>
  );
}

function WarrantyItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[rgba(214,181,107,0.15)] bg-[rgba(255,255,255,0.04)] p-5">
      <p className="gold-text text-sm font-black">{title}</p>
      <p className="mt-2 text-base font-black text-white">{value}</p>
    </div>
  );
}