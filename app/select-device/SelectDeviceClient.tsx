"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Product } from "@/lib/products";
import { calculateInstallment, formatJod } from "@/lib/installments";

type Props = {
  tracking: string;
  phone: string;
  products: Product[];
};

const MONTHS = [12, 24, 36];

export default function SelectDeviceClient({ tracking, phone, products }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [months, setMonths] = useState(24);
  const [downPayment, setDownPayment] = useState("");
  const [color, setColor] = useState("");
  const [search, setSearch] = useState("");

  const selectedProduct = products.find((product) => product.id === selectedId) || null;
  const calculation = useMemo(() => {
    if (!selectedProduct) return null;
    return calculateInstallment({
      price: selectedProduct.price,
      months,
      downPayment: Number(downPayment || 0),
    });
  }, [selectedProduct, months, downPayment]);

  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.model} ${product.brand}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <form action="/api/select-device" method="POST" className="mt-6 space-y-6">
      <input type="hidden" name="tracking" value={tracking} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="productId" value={selectedId} />
      <input type="hidden" name="months" value={months} />

      <section className="glass-panel gold-outline sticky top-3 z-20 rounded-[26px] p-4 backdrop-blur-xl">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث عن iPhone أو Samsung أو اسم الجهاز..."
          className="w-full rounded-2xl border border-[#d6b56b]/20 bg-[#03120e]/80 px-4 py-3 text-right text-sm font-bold text-white outline-none focus:border-[#d6b56b]"
        />
      </section>

      <section className="stagger-grid grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((product) => {
          const active = selectedId === product.id;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelectedId(product.id)}
              className={`card-reveal interactive-lift overflow-hidden rounded-[24px] border text-right transition ${
                active
                  ? "border-[#69d97b] bg-[#69d97b]/10 shadow-[0_0_0_4px_rgba(105,217,123,0.08)]"
                  : "border-[#d6b56b]/18 bg-[#082a23]/75"
              }`}
            >
              <div className="relative h-40 bg-white/[0.025] sm:h-52">
                <Image src={product.image} alt={product.name} fill sizes="(max-width:768px) 50vw, 25vw" className="product-float object-contain p-3" />
              </div>
              <div className="border-t border-[#d6b56b]/15 p-3">
                <p className="text-sm font-black text-white">{product.name}</p>
                <p className="mt-1 text-xs font-bold text-[#aeb9af]">{product.model}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-[#69d97b]">{formatJod(product.price)}</p>
                  {product.originalPrice && (
                    <p className="text-[10px] font-bold text-[#879487] line-through">{formatJod(product.originalPrice)}</p>
                  )}
                </div>
                <p className={`mt-3 text-xs font-black ${active ? "text-[#b8f3c0]" : "text-[#f3dfac]"}`}>
                  {active ? "✓ تم اختيار الجهاز" : "اضغط للاختيار"}
                </p>
              </div>
            </button>
          );
        })}
      </section>

      <section className="glass-panel-strong gold-outline rounded-[30px] p-5 sm:p-7">
        <h2 className="text-2xl font-black">تفاصيل التقسيط واللون</h2>

        {!selectedProduct ? (
          <p className="mt-4 rounded-2xl border border-[#d6b56b]/20 bg-[#d6b56b]/8 p-4 text-sm font-bold text-[#f3dfac]">
            اختر جهازًا من القائمة أولًا.
          </p>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-sm font-black text-[#f3dfac]">مدة التقسيط</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {MONTHS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMonths(option)}
                    className={`rounded-2xl px-3 py-3 text-sm font-black ${months === option ? "green-button" : "soft-button"}`}
                  >
                    {option} شهر
                  </button>
                ))}
              </div>

              <label className="mt-5 block text-sm font-black text-[#f3dfac]">الدفعة الأولى — اختيارية</label>
              <input
                name="downPayment"
                inputMode="decimal"
                value={downPayment}
                onChange={(event) => setDownPayment(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className="mt-2 w-full rounded-2xl border border-[#d6b56b]/20 bg-[#03120e]/70 px-4 py-3 text-right font-black text-white outline-none focus:border-[#d6b56b]"
              />

              <label className="mt-5 block text-sm font-black text-[#f3dfac]">اللون المطلوب</label>
              <input
                required
                name="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                maxLength={80}
                placeholder="مثال: أسود، وإذا غير متوفر أزرق"
                className="mt-2 w-full rounded-2xl border border-[#d6b56b]/20 bg-[#03120e]/70 px-4 py-3 text-right font-bold text-white outline-none focus:border-[#d6b56b]"
              />
            </div>

            <div className="rounded-[26px] border border-[#69d97b]/20 bg-[#69d97b]/8 p-5">
              <p className="text-sm font-black text-[#b8f3c0]">ملخص الاختيار</p>
              <h3 className="mt-3 text-2xl font-black">{selectedProduct.name}</h3>
              <p className="mt-1 text-sm font-bold text-[#aeb9af]">{selectedProduct.model}</p>
              <div className="mt-5 space-y-3 text-sm font-bold">
                <p className="flex justify-between gap-3"><span>السعر</span><strong>{formatJod(selectedProduct.price)}</strong></p>
                <p className="flex justify-between gap-3"><span>المدة</span><strong>{months} شهر</strong></p>
                <p className="flex justify-between gap-3"><span>القسط التقريبي</span><strong>{calculation ? formatJod(calculation.monthly) : "—"}</strong></p>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedProduct || !color.trim()}
          className="green-button button-shimmer mt-6 w-full rounded-2xl px-6 py-4 text-base font-black disabled:cursor-not-allowed disabled:opacity-45"
        >
          حفظ الجهاز على نفس الطلب
        </button>
      </section>
    </form>
  );
}
