"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { products, type Product } from "@/lib/products";
import { calculateInstallment } from "@/lib/installments";

const MONTH_OPTIONS = [12, 24, 36];

function ProductCard({ product }: { product: Product }) {
  const [months, setMonths] = useState(24);
  const [downPayment, setDownPayment] = useState("");

  const downPaymentNumber = Number(downPayment || 0);

  const calculation = useMemo(() => {
    return calculateInstallment({
      price: product.price,
      months,
      downPayment: downPaymentNumber,
    });
  }, [product.price, months, downPaymentNumber]);

  const applyHref = `/apply?product=${encodeURIComponent(
    product.id
  )}&months=${encodeURIComponent(String(months))}&downPayment=${encodeURIComponent(
    String(calculation.downPayment)
  )}`;

  return (
    <article className="glass-panel gold-outline overflow-hidden rounded-[24px] transition hover:-translate-y-1 hover:shadow-2xl sm:rounded-[30px]">
      <div className="relative h-48 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] sm:h-64">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(214,181,107,0.12),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(93,210,122,0.08),transparent_28%)]" />

        {product.badge && (
          <div className="absolute right-3 top-3 z-10 rounded-full border border-[rgba(214,181,107,0.25)] bg-[rgba(3,18,14,0.88)] px-3 py-1 text-[10px] font-black text-[#f3dfac] shadow-lg">
            {product.badge}
          </div>
        )}

        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-contain p-4"
        />
      </div>

      <div className="border-t border-[rgba(214,181,107,0.14)] p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="gold-chip rounded-full px-2 py-1 text-[10px] font-black sm:px-3 sm:text-xs">
            {product.brand}
          </span>

          <span className="rounded-full border border-[rgba(214,181,107,0.14)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-[10px] font-black text-[#c8d5c8] sm:px-3 sm:text-xs">
            {product.warranty}
          </span>
        </div>

        <h3 className="line-clamp-2 min-h-[44px] text-sm font-black leading-6 text-white sm:min-h-[56px] sm:text-xl sm:leading-7">
          {product.name}
        </h3>

        <p className="mt-1 line-clamp-1 text-xs font-bold text-[#aeb9af] sm:text-sm">
          {product.model}
        </p>

        <p className="mt-3 text-xs font-bold text-[#aeb9af]">السعر النقدي</p>

        <p className="text-xl font-black text-[#69d97b] sm:text-2xl">
          JOD {product.price}
        </p>

        <div className="mt-4 rounded-2xl border border-[rgba(214,181,107,0.15)] bg-[rgba(255,255,255,0.035)] p-3">
          <p className="mb-2 text-xs font-black text-[#d7ddd5]">مدة التقسيط</p>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                className={`rounded-xl px-2 py-2 text-[11px] font-black transition sm:text-xs ${
                  months === option
                    ? "green-button"
                    : "border border-[rgba(214,181,107,0.12)] bg-[rgba(255,255,255,0.04)] text-[#d7ddd5] hover:bg-[rgba(255,255,255,0.07)]"
                }`}
              >
                {option} شهر
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-black text-[#d7ddd5]">
            الدفعة الأولى
          </label>

          <input
            inputMode="numeric"
            value={downPayment}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              setDownPayment(value);
            }}
            placeholder="0"
            className="mt-2 w-full rounded-xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.55)] px-3 py-2 text-right text-sm font-black text-white outline-none placeholder:text-[#77867a] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
          />

          <p className="mt-2 text-[11px] font-bold leading-5 text-[#aeb9af]">
            اتركها 0 إذا بدك بدون دفعة أولى.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[linear-gradient(180deg,rgba(214,181,107,0.1),rgba(214,181,107,0.035))] p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#c8d5c8]">الفائدة</span>
            <span className="font-black text-[#f3dfac]">
              {(calculation.interestRate * 100).toFixed(0)}%
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#c8d5c8]">القسط التقريبي</span>
            <span className="text-base font-black text-white">
              {calculation.monthly.toFixed(0)} د.أ / شهر
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href={applyHref}
            className="green-button rounded-2xl px-3 py-3 text-center text-xs font-black transition sm:text-sm"
          >
            قدّم على هذا الجهاز
          </Link>

          <button
            type="button"
            onClick={() => {
              setMonths(24);
              setDownPayment("");
            }}
            className="soft-button rounded-2xl px-3 py-3 text-xs font-black transition sm:text-sm"
          >
            تصفير
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ProductsPage() {
  const [brand, setBrand] = useState<"all" | "Apple" | "Samsung">("all");
  const [search, setSearch] = useState("");

  const filteredProducts = products.filter((product) => {
    const matchesBrand = brand === "all" || product.brand === brand;
    const searchText =
      `${product.name} ${product.model} ${product.brand}`.toLowerCase();
    const matchesSearch = searchText.includes(search.trim().toLowerCase());

    return matchesBrand && matchesSearch;
  });

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden text-[#f7f3e8]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[280px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[25%] h-[280px] w-[280px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 border-b border-[rgba(214,181,107,0.18)] bg-[rgba(2,18,14,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-[rgba(214,181,107,0.2)] bg-[rgba(255,255,255,0.04)] shadow-lg">
              <Image
                src="/logo.png"
                alt="الأمين للأقساط"
                fill
                priority
                sizes="48px"
                className="object-contain p-1"
              />
            </div>

            <div>
              <p className="text-lg font-black text-white">الأمين للأقساط</p>
              <p className="gold-text text-xs font-black tracking-wide">
                AL AMEEN FINANCE
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-[#d7ddd5] md:flex">
            <Link href="/" className="hover:text-white">
              الرئيسية
            </Link>
            <Link href="/products" className="text-white">
              الهواتف
            </Link>
            <Link href="/track" className="hover:text-white">
              تتبع الطلب
            </Link>
            <Link href="/faq" className="hover:text-white">
              FAQ
            </Link>
          </nav>

          <Link
            href="/apply"
            className="green-button rounded-2xl px-4 py-3 text-xs font-black shadow-xl transition sm:px-5 sm:text-sm"
          >
            طلب عام
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="site-shell pattern-lines overflow-hidden rounded-[30px] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:rounded-[40px]">
          <div className="relative overflow-hidden rounded-[28px] border border-[rgba(214,181,107,0.14)] p-6 sm:p-10 lg:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(214,181,107,0.1),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(90,210,122,0.08),transparent_26%)]" />

            <div className="relative grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <p className="gold-chip mb-4 inline-flex rounded-full px-4 py-2 text-xs font-black sm:text-sm">
                  هاتفك الجديد صار أقرب مما تتوقع
                </p>

                <h1 className="text-3xl font-black leading-[1.25] text-white sm:text-5xl">
                  اختر هاتفك
                  <br />
                  <span className="gold-text">وابدأ التقسيط بثقة</span>
                </h1>

                <p className="mt-5 max-w-xl text-sm font-medium leading-8 text-[#cbd6cb] sm:text-base">
                  اختر مدة التقسيط 12 أو 24 أو 36 شهر، وحدد الدفعة الأولى إذا
                  رغبت. إذا تركتها صفر، يعتبر الطلب بدون دفعة أولى.
                </p>

                <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <HeroStat value="12" label="شهر" />
                  <HeroStat value="24" label="شهر" />
                  <HeroStat value="36" label="شهر" />
                  <HeroStat value="5 د.أ" label="رسوم الملف" />
                </div>
              </div>

              <div className="glass-panel-strong rounded-[28px] p-6">
                <h2 className="text-2xl font-black text-white">شروط التمويل المختصرة</h2>

                <div className="mt-5 grid gap-3 text-sm leading-7 text-[#cbd6cb]">
                  <p>✓ الفائدة 5% لكل 12 شهر.</p>
                  <p>✓ التسليم بعد الموافقة وتوقيع العقد.</p>
                  <p>✓ رسوم فتح الملف 5 دنانير غير مستردة.</p>
                  <p>✓ القسط الظاهر تقريبي قبل دراسة الطلب.</p>
                </div>

                <div className="section-divider my-6" />

                <Link
                  href="/apply"
                  className="gold-button block rounded-2xl px-6 py-4 text-center text-sm font-black transition"
                >
                  تقديم طلب بدون جهاز محدد
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-[81px] z-30 mx-auto max-w-7xl px-4">
        <div className="glass-panel gold-outline rounded-[24px] p-4 shadow-lg backdrop-blur">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن جهاز..."
              className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.55)] px-4 py-3 text-right text-sm font-bold text-white outline-none placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:bg-[rgba(3,18,14,0.72)] focus:ring-4 focus:ring-[#d6b56b]/10"
            />

            <div className="grid grid-cols-3 gap-2">
              <FilterButton active={brand === "all"} onClick={() => setBrand("all")}>
                الكل
              </FilterButton>

              <FilterButton active={brand === "Apple"} onClick={() => setBrand("Apple")}>
                iPhone
              </FilterButton>

              <FilterButton
                active={brand === "Samsung"}
                onClick={() => setBrand("Samsung")}
              >
                Samsung
              </FilterButton>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white">الأجهزة المتاحة</h2>
            <p className="mt-1 text-xs font-bold text-[#aeb9af] sm:text-sm">
              العرض على الموبايل: جهازين جنب بعض.
            </p>
          </div>

          <div className="gold-chip rounded-2xl px-4 py-3 text-xs font-black shadow-sm">
            {filteredProducts.length} جهاز
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="glass-panel gold-outline rounded-[28px] p-10 text-center">
            <h3 className="text-lg font-black text-white">لا توجد نتائج</h3>
            <p className="mt-2 text-sm text-[#aeb9af]">
              جرّب البحث باسم جهاز آخر.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10">
        <div className="glass-panel-strong rounded-[30px] p-6 shadow-2xl sm:p-8">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="gold-text mb-2 text-sm font-black">ابدأ الآن</p>
              <h2 className="text-2xl font-black text-white">جاهز تبدأ طلبك؟</h2>
              <p className="mt-2 text-sm leading-7 text-[#cbd6cb]">
                اختر الجهاز، حدد مدة التقسيط والدفعة الأولى، ثم أرسل الطلب.
              </p>
            </div>

            <Link
              href="/apply"
              className="gold-button rounded-2xl px-6 py-4 text-center text-sm font-black transition"
            >
              تقديم طلب بدون جهاز محدد
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
        active
          ? "green-button"
          : "border border-[rgba(214,181,107,0.12)] bg-[rgba(255,255,255,0.04)] text-[#d7ddd5] hover:bg-[rgba(255,255,255,0.07)]"
      }`}
    >
      {children}
    </button>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-chip rounded-2xl p-4 text-center">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#b9c6b9]">{label}</p>
    </div>
  );
}