import Image from "next/image";
import Link from "next/link";
import { MenuIcon, TrackIcon, WhatsAppIcon } from "./UiIcons";

type Props = { active?: "home" | "products" | "track" | "faq" };

const nav = [
  { key: "home", href: "/", label: "الرئيسية" },
  { key: "products", href: "/products", label: "الأجهزة" },
  { key: "track", href: "/track", label: "تتبع الطلب" },
  { key: "faq", href: "/faq", label: "الأسئلة الشائعة" },
] as const;

export default function SiteHeader({ active }: Props) {
  return (
    <header className="v2-header">
      <div className="v2-container v2-header-inner">
        <Link href="/" className="v2-brand" aria-label="الأمين للأقساط - الرئيسية">
          <span className="v2-logo-wrap">
            <Image src="/logo.png" alt="شعار الأمين للأقساط" fill priority sizes="48px" className="object-contain" />
          </span>
          <span>
            <strong>الأمين للأقساط</strong>
            <small>تقسيط الأجهزة الإلكترونية</small>
          </span>
        </Link>

        <nav className="v2-desktop-nav" aria-label="التنقل الرئيسي">
          {nav.map((item) => (
            <Link key={item.key} href={item.href} className={active === item.key ? "is-active" : ""}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="v2-header-actions">
          <Link href="/whatsapp" className="v2-icon-button" aria-label="التواصل عبر واتساب">
            <WhatsAppIcon size={20} />
          </Link>
          <Link href="/track" className="v2-button v2-button-secondary v2-header-track">
            <TrackIcon size={18} />
            <span>تابع طلبك</span>
          </Link>
          <Link href="/products" className="v2-button v2-button-primary">
            اختر جهازك
          </Link>
          <details className="v2-mobile-menu">
            <summary className="v2-icon-button" aria-label="فتح القائمة"><MenuIcon /></summary>
            <div className="v2-mobile-menu-panel">
              {nav.map((item) => <Link key={item.key} href={item.href}>{item.label}</Link>)}
              <Link href="/privacy">الخصوصية</Link>
              <Link href="/terms">الشروط</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
