import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/site/MobileBottomNav";
import {
  ArrowIcon,
  CalendarIcon,
  CheckIcon,
  DocumentIcon,
  PhoneIcon,
  ShieldIcon,
  SparklesIcon,
  TagIcon,
  TrackIcon,
  WalletIcon,
  WhatsAppIcon,
} from "@/components/site/UiIcons";
import { getProductById } from "@/lib/products";
import { calculateInstallment, formatJod } from "@/lib/installments";

function requiredProduct(id: string) {
  const product = getProductById(id);
  if (!product) throw new Error(`Missing featured product: ${id}`);
  return product;
}

const featured = [
  requiredProduct("iphone-16-pro"),
  requiredProduct("s25-ultra-5g-sm-s938b"),
  requiredProduct("iphone-15"),
  requiredProduct("honor-600-pro"),
];

const trustItems = [
  { Icon: DocumentIcon, title: "تقديم إلكتروني", text: "خطوات واضحة من الهاتف" },
  { Icon: WhatsAppIcon, title: "متابعة عبر واتساب", text: "تحديثات مرتبطة بطلبك" },
  { Icon: WalletIcon, title: "دفعة أولى اختيارية", text: "اختيار يناسب قدرتك" },
  { Icon: CalendarIcon, title: "حتى 36 شهرًا", text: "خيارات 12 و24 و36 شهرًا" },
];

const steps = [
  { number: "01", Icon: PhoneIcon, title: "اختر الجهاز", text: "تصفح الأجهزة وحدد الموديل والسعة والمدة المناسبة." },
  { number: "02", Icon: DocumentIcon, title: "أرسل الطلب", text: "أكمل بياناتك وارفع المستندات المطلوبة من الرابط الرسمي." },
  { number: "03", Icon: TrackIcon, title: "تابع النتيجة", text: "تابع المرحلة الفعلية للطلب وتلقى التحديث عبر واتساب." },
];

const faqs = [
  { q: "هل اختيار الجهاز إلزامي؟", a: "نعم. لا يمكن إنشاء طلب جديد دون اختيار جهاز ومدة تقسيط. هذا يمنع الطلبات الناقصة ويجعل الدراسة أوضح." },
  { q: "هل الدفعة الأولى إجبارية؟", a: "لا. يمكنك إدخال دفعة أولى أو تركها صفرًا، ويعاد احتساب القسط التقريبي مباشرة." },
  { q: "كيف أتابع طلبي؟", a: "من صفحة تتبع الطلب باستخدام رقم الهاتف ورقم التتبع، أو عبر واتساب من نفس المحادثة المرتبطة بالطلب." },
];

export default function HomePage() {
  const heroProduct = featured[0];
  const heroMonthly = calculateInstallment({ price: heroProduct.price, months: 36, downPayment: 0 }).monthly;

  return (
    <main dir="rtl" className="v2-page v2-home-page">
      <SiteHeader active="home" />

      <section className="v2-hero v2-container">
        <div className="v2-hero-copy v2-reveal">
          <div className="v2-kicker"><SparklesIcon size={18}/> تجربة تقسيط أوضح وأحدث</div>
          <h1>اختر جهازك اليوم<br/><span>وادفع على راحتك</span></h1>
          <p>
            اختر جهازك أولًا، شاهد القسط التقريبي، وقدّم طلبك إلكترونيًا بخطوات مرتبة ومتابعة واضحة عبر واتساب.
          </p>
          <div className="v2-hero-actions">
            <Link href="/products" className="v2-button v2-button-primary v2-button-large">
              اختر جهازك <ArrowIcon size={19}/>
            </Link>
            <Link href="/track" className="v2-button v2-button-secondary v2-button-large">
              <TrackIcon size={19}/> تابع طلبك
            </Link>
          </div>
          <div className="v2-hero-note"><ShieldIcon size={19}/> المستندات الحساسة تُرفع من الرابط الرسمي المرتبط بالطلب فقط.</div>
        </div>

        <div className="v2-hero-visual v2-reveal v2-reveal-delay-1" aria-label="أجهزة مختارة">
          <div className="v2-hero-glow" />
          <div className="v2-hero-phone v2-hero-phone-back">
            <Image src="/assets/iphone15plus.jpg" alt="iPhone" fill priority sizes="260px" className="object-contain" />
          </div>
          <div className="v2-hero-phone v2-hero-phone-main">
            <Image src={heroProduct.image} alt={heroProduct.name} fill priority sizes="340px" className="object-contain" />
          </div>
          <div className="v2-hero-phone v2-hero-phone-side">
            <Image src="/assets/s25ultra.jpg" alt="Samsung S25 Ultra" fill priority sizes="240px" className="object-contain" />
          </div>
          <div className="v2-discount-card">
            <span><TagIcon size={22}/></span>
            <div><strong>وفر 5%</strong><small>على جميع أجهزة iPhone</small></div>
          </div>
          <div className="v2-monthly-card">
            <small>{heroProduct.name}</small>
            <strong>من {formatJod(heroMonthly)} شهريًا</strong>
            <span>على 36 شهرًا — تقديري</span>
          </div>
        </div>
      </section>

      <section className="v2-container v2-trust-strip v2-reveal v2-reveal-delay-2">
        {trustItems.map(({ Icon, title, text }) => (
          <div key={title} className="v2-trust-item">
            <span><Icon size={24}/></span>
            <div><strong>{title}</strong><small>{text}</small></div>
          </div>
        ))}
      </section>

      <section className="v2-section v2-container">
        <div className="v2-section-heading">
          <div><span>أجهزة مميزة</span><h2>ابدأ من الخيارات الأكثر طلبًا</h2></div>
          <Link href="/products">عرض جميع الأجهزة <ArrowIcon size={17}/></Link>
        </div>
        <div className="v2-featured-grid">
          {featured.map((product, index) => {
            const monthly = calculateInstallment({ price: product.price, months: 36, downPayment: 0 }).monthly;
            return (
              <article key={product.id} className={`v2-product-card v2-reveal v2-reveal-delay-${Math.min(index + 1, 3)}`}>
                <div className="v2-product-image">
                  {product.badge && <span className="v2-badge">{product.badge}</span>}
                  <Image src={product.image} alt={product.name} fill sizes="(max-width:768px) 50vw, 25vw" className="object-contain" />
                </div>
                <div className="v2-product-body">
                  <small>{product.brand} · {product.model}</small>
                  <h3>{product.name}</h3>
                  <div className="v2-price-row">
                    <div>
                      {product.originalPrice && <del>{formatJod(product.originalPrice)}</del>}
                      <strong>{formatJod(product.price)}</strong>
                    </div>
                    <span>من {formatJod(monthly)} / شهر</span>
                  </div>
                  <Link href={`/apply?product=${product.id}&months=36&downPayment=0`} className="v2-card-action">
                    اختيار الجهاز <ArrowIcon size={17}/>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="v2-section v2-how-section">
        <div className="v2-container">
          <div className="v2-section-heading v2-centered-heading">
            <div><span>ثلاث خطوات فقط</span><h2>كيف تعمل الخدمة؟</h2></div>
          </div>
          <div className="v2-steps-grid">
            {steps.map(({ number, Icon, title, text }, index) => (
              <div key={number} className={`v2-step-card v2-reveal v2-reveal-delay-${index + 1}`}>
                <div className="v2-step-top"><span>{number}</span><Icon size={27}/></div>
                <h3>{title}</h3><p>{text}</p>
                {index < steps.length - 1 && <div className="v2-step-connector"><ArrowIcon size={20}/></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="v2-section v2-container v2-split-section">
        <div className="v2-info-panel v2-reveal">
          <span className="v2-info-icon"><ShieldIcon size={30}/></span>
          <div><small>خصوصية وأمان</small><h2>بياناتك ليست مادة للمحادثة</h2></div>
          <p>الهوية وكشف الراتب وأي مستند حساس تُرفع فقط من الرابط الرسمي الآمن المرتبط بالطلب، ولا تُرسل عبر واتساب.</p>
          <ul>
            <li><CheckIcon size={17}/> رابط مخصص مرتبط بطلبك</li>
            <li><CheckIcon size={17}/> متابعة المرحلة الفعلية دون وعود غير مؤكدة</li>
            <li><CheckIcon size={17}/> لا يظهر عنوان المكتب قبل الموافقة أو الموعد الرسمي</li>
          </ul>
        </div>
        <div className="v2-faq-panel v2-reveal v2-reveal-delay-1">
          <div className="v2-section-heading"><div><span>مختصر ومباشر</span><h2>أسئلة شائعة</h2></div></div>
          <div className="v2-accordion-list">
            {faqs.map((item, index) => (
              <details key={item.q} open={index === 0}>
                <summary>{item.q}<span>+</span></summary><p>{item.a}</p>
              </details>
            ))}
          </div>
          <Link href="/faq" className="v2-text-link">عرض جميع الأسئلة <ArrowIcon size={17}/></Link>
        </div>
      </section>

      <section className="v2-container v2-final-cta v2-reveal">
        <div><span>جاهز تبدأ؟</span><h2>اختر الجهاز أولًا، والباقي خطوة بخطوة.</h2><p>لن يتم إنشاء طلب ناقص أو بدون جهاز محدد.</p></div>
        <Link href="/products" className="v2-button v2-button-light v2-button-large">تصفح الأجهزة <ArrowIcon size={19}/></Link>
      </section>

      <SiteFooter />
      <MobileBottomNav active="home" />
    </main>
  );
}
