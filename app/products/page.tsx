"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { products, type Product } from "@/lib/products";
import { calculateInstallment, formatJod } from "@/lib/installments";

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
    <article className="overflow-hidden rounded-[24px] border border-[#eadfce] bg-white shadow-md transition hover:-translate-y-1 hover:shadow-xl sm:rounded-[30px]">
      <div className="relative h-48 bg-white sm:h-64">
        {product.badge && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-[#111827] px-3 py-1 text-[10px] font-black text-white shadow-lg">
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

      <div className="border-t border-[#f1e8dc] p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-[#fbf6ee] px-2 py-1 text-[10px] font-black text-[#9a7448] sm:px-3 sm:text-xs">
            {product.brand}
          </span>

          <span className="rounded-full bg-gray-50 px-2 py-1 text-[10px] font-black text-gray-500 sm:px-3 sm:text-xs">
            {product.warranty}
          </span>
        </div>

        <h3 className="line-clamp-2 min-h-[44px] text-sm font-black leading-6 text-[#111827] sm:min-h-[56px] sm:text-xl sm:leading-7">
          {product.name}
        </h3>

        <p className="mt-1 line-clamp-1 text-xs font-bold text-gray-400 sm:text-sm">
          {product.model}
        </p>

        <p className="mt-3 text-xs font-bold text-gray-400">السعر النقدي</p>

        <p className="text-xl font-black text-[#2f6faa] sm:text-2xl">
          {product.price} JOD
        </p>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-black text-gray-500">مدة التقسيط</p>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                className={`rounded-xl px-2 py-2 text-[11px] font-black transition sm:text-xs ${
                  months === option
                    ? "bg-[#111827] text-white"
                    : "bg-white text-gray-600"
                }`}
              >
                {option} شهر
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-black text-gray-500">
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
            className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-right text-sm font-black outline-none focus:border-[#111827]"
          />

          <p className="mt-2 text-[11px] font-bold leading-5 text-gray-400">
            اتركها 0 إذا بدك بدون دفعة أولى.
          </p>
        </div>

        <div className="mt-4 rounded-2xl bg-[#fbf6ee] p-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-gray-500">الفائدة</span>
            <span className="font-black text-[#9a7448]">
              {(calculation.interestRate * 100).toFixed(0)}%
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-gray-500">القسط التقريبي</span>
            <span className="text-base font-black text-[#111827]">
              {calculation.monthly.toFixed(0)} د.أ / شهر
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href={applyHref}
            className="rounded-2xl bg-[#111827] px-3 py-3 text-center text-xs font-black text-white transition hover:bg-black sm:text-sm"
          >
            قدّم على هذا الجهاز
          </Link>

          <button
            type="button"
            onClick={() => {
              setMonths(24);
              setDownPayment("");
            }}
            className="rounded-2xl border border-gray-200 bg-white px-3 py-3 text-xs font-black text-gray-700 transition hover:bg-gray-50 sm:text-sm"
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
    <main dir="rtl" className="min-h-screen bg-[#f6f3ee] text-[#111827]">
      <header className="sticky top-0 z-30 border-b border-[#eadfce] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#eadfce]">
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
              <p className="text-lg font-black">الأمين للأقساط</p>
              <p className="text-xs font-bold text-[#b28b5e]">
                AL AMEEN FINANCE
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-gray-600 md:flex">
            <Link href="/">الرئيسية</Link>
            <Link href="/products" className="text-[#111827]">
              الهواتف
            </Link>
            <Link href="/track">تتبع الطلب</Link>
            <Link href="/faq">FAQ</Link>
          </nav>

          <Link
            href="/apply"
            className="rounded-2xl bg-[#111827] px-4 py-3 text-xs font-black text-white shadow-lg transition hover:bg-black sm:px-5 sm:text-sm"
          >
            طلب عام
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="overflow-hidden rounded-[30px] border border-[#eadfce] bg-white shadow-xl sm:rounded-[36px]">
          <div className="grid gap-4 p-6 sm:p-10 lg:grid-cols-2 lg:p-12">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-[#d8c09c] bg-[#fbf6ee] px-4 py-2 text-xs font-black text-[#9a7448] sm:text-sm">
                بدون دفعة أولى — والدفعة اختيارية حسب قدرة الزبون
              </p>

              <h1 className="text-3xl font-black leading-[1.25] sm:text-5xl">
                اختر هاتفك
                <br />
                <span className="text-[#b28b5e]">وابدأ التقسيط</span>
              </h1>

              <p className="mt-5 max-w-xl text-sm font-medium leading-8 text-gray-600 sm:text-base">
                اختر مدة التقسيط 12 أو 24 أو 36 شهر، وحدد الدفعة الأولى إذا
                رغبت. إذا تركتها صفر، يعتبر الطلب بدون دفعة أولى.
              </p>
            </div>

            <div className="rounded-[28px] bg-[#111827] p-6 text-white">
              <h2 className="text-2xl font-black">شروط التمويل المختصرة</h2>

              <div className="mt-5 grid gap-3 text-sm leading-7 text-gray-300">
                <p>✓ الفائدة 5% لكل 12 شهر.</p>
                <p>✓ التسليم من المعرض بعد الموافقة وتوقيع العقد.</p>
                <p>✓ رسوم فتح الملف 5 دنانير غير مستردة.</p>
                <p>✓ القسط الظاهر تقريبي قبل دراسة الطلب.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-[81px] z-20 mx-auto max-w-7xl px-4">
        <div className="rounded-[24px] border border-[#eadfce] bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن جهاز..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold outline-none focus:border-[#111827] focus:bg-white"
            />

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setBrand("all")}
                className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                  brand === "all"
                    ? "bg-[#111827] text-white"
                    : "bg-gray-50 text-gray-600"
                }`}
              >
                الكل
              </button>

              <button
                type="button"
                onClick={() => setBrand("Apple")}
                className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                  brand === "Apple"
                    ? "bg-[#111827] text-white"
                    : "bg-gray-50 text-gray-600"
                }`}
              >
                iPhone
              </button>

              <button
                type="button"
                onClick={() => setBrand("Samsung")}
                className={`rounded-2xl px-4 py-3 text-xs font-black transition ${
                  brand === "Samsung"
                    ? "bg-[#111827] text-white"
                    : "bg-gray-50 text-gray-600"
                }`}
              >
                Samsung
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">الأجهزة المتاحة</h2>
            <p className="mt-1 text-xs font-bold text-gray-500 sm:text-sm">
              العرض على الموبايل: جهازين جنب بعض.
            </p>
          </div>

          <div className="rounded-2xl border border-[#eadfce] bg-white px-4 py-3 text-xs font-black text-gray-600 shadow-sm">
            {filteredProducts.length} جهاز
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-gray-200 bg-white p-10 text-center">
            <h3 className="text-lg font-black text-gray-700">لا توجد نتائج</h3>
            <p className="mt-2 text-sm text-gray-500">
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
        <div className="rounded-[30px] bg-[#111827] p-6 text-white shadow-xl sm:p-8">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-black">جاهز تبدأ طلبك؟</h2>
              <p className="mt-2 text-sm leading-7 text-gray-300">
                اختر الجهاز، حدد مدة التقسيط والدفعة الأولى، ثم أرسل الطلب.
              </p>
            </div>

            <Link
              href="/apply"
              className="rounded-2xl bg-[#c49a63] px-6 py-4 text-center text-sm font-black text-white transition hover:bg-[#b28b5e]"
            >
              تقديم طلب بدون جهاز محدد
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}