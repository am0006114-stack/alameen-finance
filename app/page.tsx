import Image from "next/image";
import Link from "next/link";

const legalRegistrationText =
  "الجهة المالكة والمشغلة للموقع هي Al Ameen for Financial Services، سجل تجاري رقم 728394، والرقم الوطني للمنشأة / الضريبي 102348761، بتاريخ تسجيل 15/03/2025.";

const featuredBenefits = [
  {
    title: "تقديم أونلاين بالكامل",
    description: "قدّم طلبك من البيت خلال دقائق بدون زيارة أولية للمعرض.",
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
    title: "استلام من المعرض",
    description: "بعد الموافقة، يتم شراء الجهاز وتسليمه مع توقيع العقد.",
  },
];

const steps = [
  ["1", "اختر الجهاز", "تصفح أجهزة iPhone و Samsung واختر الأنسب لك."],
  ["2", "قدّم الطلب", "عبّئ البيانات وارفع صور الهويات المطلوبة."],
  ["3", "ادفع رسوم الملف", "ادفع 5 دنانير وأدخل رقم الوصل/الحركة."],
  ["4", "انتظر الدراسة", "تتم مراجعة الطلب خلال 24 إلى 72 ساعة عمل."],
  ["5", "استلم من المعرض", "بعد الموافقة، يتم شراء الجهاز وتسليمه مع توقيع العقد."],
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
    <main
      dir="rtl"
      className="min-h-screen overflow-x-hidden bg-[#f6f3ee] text-[#111827]"
    >
      <header className="sticky top-0 z-40 border-b border-[#eadfce] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#eadfce] sm:h-14 sm:w-14">
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
              <p className="truncate text-base font-black leading-6 sm:text-lg">
                الأمين للأقساط
              </p>
              <p className="truncate text-[11px] font-bold tracking-wide text-[#b28b5e] sm:text-xs">
                AL AMEEN FINANCE
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-gray-600 lg:flex">
            <Link href="/" className="text-[#111827]">
              الرئيسية
            </Link>
            <Link href="/products">تصفح الهواتف</Link>
            <Link href="/track">تتبع الطلب</Link>
            <Link href="/faq">الأسئلة الشائعة</Link>
            <Link href="/terms">الشروط</Link>
            <Link href="/privacy">الخصوصية</Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/whatsapp"
              className="hidden rounded-2xl border border-[#eadfce] bg-white px-4 py-3 text-sm font-black text-[#111827] shadow-sm transition hover:bg-[#fbf6ee] sm:inline-flex"
            >
              واتساب
            </Link>

            <Link
              href="/products"
              className="rounded-2xl bg-[#111827] px-4 py-3 text-xs font-black text-white shadow-lg transition hover:bg-black sm:px-5 sm:text-sm"
            >
              تصفح الهواتف
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:py-8 lg:py-12">
        <div className="relative overflow-hidden rounded-[30px] border border-[#eadfce] bg-white shadow-2xl sm:rounded-[40px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#eadfce_0%,transparent_28%),radial-gradient(circle_at_80%_10%,#f6ead8_0%,transparent_25%)]" />

          <div className="relative grid gap-8 p-5 sm:p-8 lg:min-h-[680px] lg:grid-cols-[1.05fr_0.95fr] lg:p-14">
            <div className="flex flex-col justify-center">
              <p className="mb-4 inline-flex w-fit max-w-full rounded-full border border-[#d8c09c] bg-[#fbf6ee] px-3 py-2 text-xs font-black leading-6 text-[#9a7448] sm:mb-5 sm:px-4 sm:text-sm">
                تقسيط هواتف فاخر — تقديم أونلاين واستلام من المعرض
              </p>

              <h1 className="max-w-full text-3xl font-black leading-[1.35] tracking-tight sm:text-5xl sm:leading-[1.25] lg:text-6xl">
                قسط هاتفك بسهولة،
                <br />
                <span className="text-[#b28b5e]">بثقة وخطوات واضحة</span>
              </h1>

              <p className="mt-5 max-w-full break-words text-sm font-bold leading-8 text-gray-600 sm:text-lg sm:leading-9">
                اختر جهاز <span dir="ltr">iPhone</span> أو{" "}
                <span dir="ltr">Samsung</span>، وقدّم طلبك أونلاين خلال دقائق.
                تحصل على دراسة للطلب خلال 24 إلى 72 ساعة عمل، وبعد الموافقة يتم
                شراء الجهاز وتسليمه من المعرض مع توقيع العقد.
              </p>

              <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
                <Link
                  href="/products"
                  className="rounded-2xl bg-[#111827] px-7 py-4 text-center text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-black"
                >
                  تصفح الهواتف
                </Link>

                <Link
                  href="/apply"
                  className="rounded-2xl bg-[#c49a63] px-7 py-4 text-center text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#b28b5e]"
                >
                  قدّم الآن
                </Link>

                <Link
                  href="/track"
                  className="rounded-2xl border border-[#111827] bg-white px-7 py-4 text-center text-base font-black text-[#111827] transition hover:bg-gray-50"
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

            <div className="relative hidden items-center justify-center lg:flex">
              <div className="absolute h-[420px] w-[420px] rounded-full bg-[#eadfce]/70 blur-3xl" />

              <div className="relative w-full max-w-xl rounded-[36px] border border-white/70 bg-white/55 p-5 shadow-2xl backdrop-blur">
                <div className="absolute -right-2 top-10 z-10 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-xl">
                  <p className="text-xs font-black text-gray-400">دراسة الطلب</p>
                  <p className="mt-1 text-xl font-black text-[#111827]">
                    24 - 72 ساعة
                  </p>
                </div>

                <div className="absolute -left-2 top-32 z-10 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-xl">
                  <p className="text-xs font-black text-gray-400">دفعة أولى</p>
                  <p className="mt-1 text-xl font-black text-[#b28b5e]">
                    اختيارية
                  </p>
                </div>

                <div className="absolute -right-2 bottom-16 z-10 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-xl">
                  <p className="text-xs font-black text-gray-400">الاستلام</p>
                  <p className="mt-1 text-xl font-black text-[#111827]">
                    من المعرض
                  </p>
                </div>

                <div className="min-h-[430px] rounded-[30px] bg-gradient-to-br from-[#fbf6ee] to-white p-6">
                  <div className="flex h-full min-h-[390px] items-end justify-center gap-5">
                    <HeroPhone
                      image="/assets/iphone16pro.jpg"
                      name="iPhone 16 Pro"
                      price="839 د.أ"
                      className="mb-10"
                    />

                    <HeroPhone
                      image="/assets/s26ultra.jpg"
                      name="S26 Ultra"
                      price="969 د.أ"
                      dark
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Link
                    href="/products"
                    className="rounded-2xl bg-[#111827] px-4 py-3 text-center text-sm font-black text-white"
                  >
                    اختر جهازك
                  </Link>
                  <Link
                    href="/whatsapp"
                    className="rounded-2xl border border-[#eadfce] bg-white px-4 py-3 text-center text-sm font-black text-[#111827]"
                  >
                    استفسار واتساب
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <section className="mx-auto max-w-7xl px-4 py-4">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-black text-[#b28b5e]">
              أجهزة مختارة
            </p>
            <h2 className="text-2xl font-black leading-tight sm:text-3xl">
              ابدأ من الأجهزة الأكثر طلبًا
            </h2>
          </div>

          <Link
            href="/products"
            className="hidden rounded-2xl bg-[#111827] px-5 py-3 text-sm font-black text-white sm:inline-flex"
          >
            عرض كل الأجهزة
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {featuredPhones.map((phone) => (
            <Link
              key={phone.name}
              href={phone.href}
              className="overflow-hidden rounded-[24px] border border-[#eadfce] bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl sm:rounded-[28px]"
            >
              <div className="relative h-44 bg-white sm:h-64">
                <Image
                  src={phone.image}
                  alt={phone.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-contain p-3 sm:p-4"
                />
              </div>

              <div className="border-t border-[#f1e8dc] bg-[#111827] p-3 text-white sm:p-4">
                <p className="text-[11px] font-black text-[#c49a63] sm:text-xs">
                  {phone.badge}
                </p>
                <h3 className="mt-2 min-h-[42px] text-sm font-black leading-6 sm:min-h-[48px] sm:text-xl">
                  {phone.name}
                </h3>
                <p className="mt-3 text-base font-black sm:text-lg">
                  {phone.price}
                </p>
                <p className="mt-1 text-[11px] font-bold leading-5 text-gray-300 sm:text-xs">
                  السعر النقدي قبل احتساب التقسيط
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-5 sm:hidden">
          <Link
            href="/products"
            className="block rounded-2xl bg-[#111827] px-5 py-4 text-center text-sm font-black text-white"
          >
            عرض كل الأجهزة
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          {featuredBenefits.map((benefit) => (
            <div
              key={benefit.title}
              className="rounded-[28px] border border-[#eadfce] bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-5 h-10 w-10 rounded-2xl bg-[#fbf6ee] ring-1 ring-[#eadfce]" />
              <h3 className="text-lg font-black">{benefit.title}</h3>
              <p className="mt-3 text-sm font-medium leading-7 text-gray-500">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="rounded-[30px] border border-[#eadfce] bg-white p-6 shadow-xl sm:rounded-[40px] sm:p-10">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-sm font-black text-[#b28b5e]">
                خطوات واضحة
              </p>
              <h2 className="text-3xl font-black sm:text-4xl">
                كيف تعمل الخدمة؟
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-8 text-gray-500">
                من اختيار الجهاز حتى الاستلام، كل خطوة واضحة ومتابعة من خلال
                رقم التتبع.
              </p>
            </div>

            <Link
              href="/faq"
              className="rounded-2xl border border-[#eadfce] bg-[#fbf6ee] px-5 py-3 text-center text-sm font-black text-[#9a7448]"
            >
              عرض الأسئلة الشائعة
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {steps.map((step) => (
              <div
                key={step[0]}
                className="rounded-[28px] border border-gray-100 bg-gray-50 p-5 text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111827] text-lg font-black text-white">
                  {step[0]}
                </div>
                <h3 className="text-lg font-black">{step[1]}</h3>
                <p className="mt-3 text-sm font-medium leading-7 text-gray-500">
                  {step[2]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[30px] bg-[#111827] p-7 text-white shadow-2xl sm:rounded-[40px] sm:p-10">
            <p className="mb-3 text-sm font-black text-[#c49a63]">
              كفالات معتمدة
            </p>

            <h2 className="text-3xl font-black leading-tight sm:text-4xl">
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
                value="من المعرض بعد الموافقة وتوقيع العقد"
              />
            </div>
          </div>

          <div className="rounded-[30px] border border-[#eadfce] bg-white p-7 shadow-xl sm:rounded-[40px] sm:p-10">
            <p className="mb-3 text-sm font-black text-[#b28b5e]">
              شروط مختصرة
            </p>

            <h2 className="text-3xl font-black">الأهلية الأساسية</h2>

            <div className="mt-6 space-y-3 text-sm font-bold leading-8 text-gray-600">
              <p>✓ للمشتركين بالضمان: الراتب الصافي لا يقل عن 350 د.أ.</p>
              <p>
                ✓ لغير المشتركين بالضمان: الراتب لا يقل عن 400 د.أ مع كفيل
                مشترك بالضمان.
              </p>
              <p>✓ وجود كفيل ورفع صور الهوية المطلوبة لمقدم الطلب والكفيل.</p>
              <p>✓ عدم وجود قضايا مالية مؤثرة حسب سياسة دراسة الطلب.</p>
              <p>✓ الموافقة النهائية بعد مراجعة الإدارة وتوقيع العقد.</p>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Link
                href="/terms"
                className="rounded-2xl bg-[#111827] px-5 py-4 text-center text-sm font-black text-white"
              >
                قراءة الشروط
              </Link>

              <Link
                href="/privacy"
                className="rounded-2xl border border-[#eadfce] bg-[#fbf6ee] px-5 py-4 text-center text-sm font-black text-[#9a7448]"
              >
                سياسة الخصوصية
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="rounded-[30px] border border-[#eadfce] bg-white p-6 shadow-xl sm:rounded-[40px] sm:p-10">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-sm font-black text-[#b28b5e]">
                أسئلة شائعة
              </p>
              <h2 className="text-3xl font-black">قبل ما تقدّم</h2>
            </div>

            <Link
              href="/faq"
              className="rounded-2xl bg-[#111827] px-5 py-3 text-center text-sm font-black text-white"
            >
              كل الأسئلة
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {faqItems.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-5 text-sm font-bold leading-8 text-gray-700"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="overflow-hidden rounded-[30px] bg-[#111827] shadow-2xl sm:rounded-[40px]">
          <div className="grid gap-6 p-7 text-white sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="mb-3 text-sm font-black text-[#c49a63]">
                ابدأ الآن
              </p>

              <h2 className="text-3xl font-black leading-tight sm:text-4xl">
                جاهز تختار جهازك؟
              </h2>

              <p className="mt-3 max-w-2xl text-sm font-medium leading-8 text-gray-300">
                تصفح الهواتف، اختر مدة التقسيط والدفعة الأولى، ثم أرسل الطلب
                بخطوات واضحة وآمنة.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/products"
                className="rounded-2xl bg-[#c49a63] px-7 py-4 text-center text-base font-black text-white transition hover:bg-[#b28b5e]"
              >
                تصفح الهواتف
              </Link>

              <Link
                href="/track"
                className="rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-center text-base font-black text-white transition hover:bg-white/15"
              >
                تتبع الطلب
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#eadfce] bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto] md:items-start">
          <div className="flex items-start gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#eadfce]">
              <Image
                src="/logo.png"
                alt="الأمين للأقساط"
                fill
                sizes="48px"
                className="object-contain p-1"
              />
            </div>

            <div>
              <p className="font-black">الأمين للأقساط</p>
              <p className="mt-1 text-xs font-bold text-gray-500">
                التقديم أونلاين فقط، والاستلام من المعرض بعد الموافقة.
              </p>
              <p className="mt-1 text-xs font-bold text-gray-400">
                Al-Madina Al-Monawara St 261, Amman 11953
              </p>

              <div className="mt-4 max-w-3xl rounded-2xl border border-[#eadfce] bg-[#fbf6ee] p-4">
                <p className="text-xs font-black text-[#9a7448]">
                  بيانات التسجيل والملكية
                </p>
                <p className="mt-2 text-xs font-bold leading-7 text-gray-600">
                  {legalRegistrationText}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm font-bold text-gray-600">
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
    <div className="rounded-2xl border border-[#eadfce] bg-white/90 p-4 shadow-sm">
      <p className="text-2xl font-black text-[#111827]">{value}</p>
      <p className="mt-1 text-xs font-bold text-gray-500">{label}</p>
    </div>
  );
}

function HeroPhone({
  image,
  name,
  price,
  dark,
  className = "",
}: {
  image: string;
  name: string;
  price: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative w-36 overflow-hidden rounded-[28px] border shadow-2xl sm:w-44 ${
        dark
          ? "border-[#111827] bg-[#111827]"
          : "border-[#eadfce] bg-white"
      } ${className}`}
    >
      <div className="relative h-52 bg-white sm:h-64">
        <Image
          src={image}
          alt={name}
          fill
          sizes="176px"
          className="object-contain p-3"
          priority
        />
      </div>

      <div className={`p-3 ${dark ? "text-white" : "text-[#111827]"}`}>
        <p className="text-sm font-black leading-5">{name}</p>
        <p className="mt-2 text-base font-black text-[#c49a63]">{price}</p>
      </div>
    </div>
  );
}

function WarrantyItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-black text-[#c49a63]">{title}</p>
      <p className="mt-2 text-base font-black text-white">{value}</p>
    </div>
  );
}