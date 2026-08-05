"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/site/MobileBottomNav";
import { ArrowIcon, FilterIcon, SearchIcon, TagIcon } from "@/components/site/UiIcons";
import { products, type Product } from "@/lib/products";
import { calculateInstallment, formatJod } from "@/lib/installments";

const MONTH_OPTIONS = [12, 24, 36];
type BrandFilter = "all" | Product["brand"];
type SortOption = "featured" | "price-asc" | "price-desc" | "name";

const BRAND_FILTERS: { value: BrandFilter; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "Apple", label: "iPhone" },
  { value: "Samsung", label: "Samsung" },
  { value: "HONOR", label: "HONOR" },
  { value: "TECNO", label: "TECNO" },
];

function ProductCard({ product }: { product: Product }) {
  const [months, setMonths] = useState(36);
  const [downPayment, setDownPayment] = useState("");
  const [expanded, setExpanded] = useState(false);
  const downPaymentNumber = Number(downPayment || 0);
  const calculation = useMemo(() => calculateInstallment({ price: product.price, months, downPayment: downPaymentNumber }), [product.price, months, downPaymentNumber]);
  const applyHref = `/apply?product=${encodeURIComponent(product.id)}&months=${months}&downPayment=${calculation.downPayment}`;

  return (
    <article className="v2-catalog-card">
      <div className="v2-catalog-image">
        <div className="v2-card-badges">
          {product.badge && <span className="v2-badge">{product.badge}</span>}
          {product.originalPrice && <span className="v2-sale-badge"><TagIcon size={14}/> خصم 5%</span>}
        </div>
        <Image src={product.image} alt={product.name} fill sizes="(max-width:768px) 50vw, (max-width:1200px) 33vw, 25vw" className="object-contain" />
      </div>
      <div className="v2-catalog-body">
        <div className="v2-product-meta"><span>{product.brand}</span><span>{product.model}</span></div>
        <h2>{product.name}</h2>
        <p className="v2-warranty">{product.warranty}</p>
        <div className="v2-catalog-price">
          <div>{product.originalPrice && <del>{formatJod(product.originalPrice)}</del>}<strong>{formatJod(product.price)}</strong></div>
          <span>السعر النقدي</span>
        </div>
        <div className="v2-installment-highlight">
          <small>القسط التقريبي</small>
          <strong>{formatJod(calculation.monthly)} <span>/ شهر</span></strong>
          <p>{months} شهر · دفعة أولى {formatJod(calculation.downPayment)}</p>
        </div>

        <button type="button" className="v2-config-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          تخصيص المدة والدفعة <span>{expanded ? "−" : "+"}</span>
        </button>
        {expanded && (
          <div className="v2-config-panel">
            <label>مدة التقسيط</label>
            <div className="v2-month-selector">
              {MONTH_OPTIONS.map((option) => <button key={option} type="button" className={months === option ? "is-active" : ""} onClick={() => setMonths(option)}>{option} شهر</button>)}
            </div>
            <label htmlFor={`down-${product.id}`}>الدفعة الأولى — اختيارية</label>
            <input id={`down-${product.id}`} inputMode="numeric" value={downPayment} onChange={(event: { target: { value: string } }) => setDownPayment(event.target.value.replace(/\D/g, ""))} placeholder="0" />
          </div>
        )}
        <Link href={applyHref} className="v2-button v2-button-primary v2-catalog-action">اختيار الجهاز <ArrowIcon size={18}/></Link>
      </div>
    </article>
  );
}

export default function ProductsPage() {
  const [brand, setBrand] = useState<BrandFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = products.filter((product) => {
      const matchesBrand = brand === "all" || product.brand === brand;
      const haystack = `${product.name} ${product.model} ${product.brand} ${product.warranty}`.toLowerCase();
      return matchesBrand && (!query || haystack.includes(query));
    });
    return [...result].sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name, "ar");
      return Number(Boolean(b.badge)) - Number(Boolean(a.badge));
    });
  }, [brand, search, sort]);

  return (
    <main dir="rtl" className="v2-page v2-products-page">
      <SiteHeader active="products" />
      <section className="v2-catalog-hero">
        <div className="v2-container v2-catalog-hero-inner">
          <div><span>الأجهزة</span><h1>اختر الجهاز الذي يناسبك</h1><p>قارن السعر والقسط التقريبي، ثم ابدأ الطلب من الجهاز نفسه. لا يوجد تقديم بدون جهاز محدد.</p></div>
          <div className="v2-catalog-stat"><strong>{products.length}</strong><span>جهازًا متاحًا للاختيار</span></div>
        </div>
      </section>

      <section className="v2-container v2-catalog-toolbar">
        <div className="v2-search-box"><SearchIcon size={20}/><input value={search} onChange={(event: { target: { value: string } }) => setSearch(event.target.value)} placeholder="ابحث عن جهاز أو ماركة..." /></div>
        <div className="v2-sort-box"><FilterIcon size={19}/><select value={sort} onChange={(event: { target: { value: string } }) => setSort(event.target.value as SortOption)}><option value="featured">الأكثر تميزًا</option><option value="price-asc">السعر: الأقل أولًا</option><option value="price-desc">السعر: الأعلى أولًا</option><option value="name">الاسم</option></select></div>
        <div className="v2-brand-chips">
          {BRAND_FILTERS.map((item) => <button key={item.value} type="button" onClick={() => setBrand(item.value)} className={brand === item.value ? "is-active" : ""}>{item.label}</button>)}
        </div>
      </section>

      <section className="v2-container v2-catalog-results">
        <div className="v2-results-title"><p>عرض <strong>{filteredProducts.length}</strong> جهاز</p>{brand === "Apple" && <span><TagIcon size={15}/> أسعار iPhone مخفضة 5%</span>}</div>
        {filteredProducts.length ? <div className="v2-catalog-grid">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <div className="v2-empty-state"><SearchIcon size={34}/><h2>ما لقينا جهازًا مطابقًا</h2><p>جرّب كلمة بحث مختلفة أو اختر «الكل».</p><button type="button" onClick={() => { setSearch(""); setBrand("all"); }}>إعادة ضبط البحث</button></div>}
      </section>
      <div className="v2-container v2-catalog-disclaimer">القسط الظاهر تقديري ويعاد احتسابه حسب المدة والدفعة الأولى. تقديم الطلب لا يعني الموافقة النهائية.</div>
      <SiteFooter />
      <MobileBottomNav active="products" />
    </main>
  );
}
