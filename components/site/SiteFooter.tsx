import Image from "next/image";
import Link from "next/link";
import { ShieldIcon, WhatsAppIcon } from "./UiIcons";

export default function SiteFooter() {
  return (
    <footer className="v2-footer">
      <div className="v2-container v2-footer-grid">
        <div className="v2-footer-brand">
          <span className="v2-footer-logo"><Image src="/logo.png" alt="الأمين للأقساط" fill sizes="52px" className="object-contain" /></span>
          <div>
            <strong>الأمين للأقساط</strong>
            <p>تقسيط الأجهزة الإلكترونية والهواتف بخطوات واضحة ومتابعة عبر واتساب.</p>
          </div>
        </div>
        <div className="v2-footer-trust">
          <ShieldIcon />
          <div><strong>مستنداتك عبر الرابط الرسمي فقط</strong><span>لا نستلم الهوية أو المستندات الحساسة عبر واتساب.</span></div>
        </div>
        <div className="v2-footer-links">
          <Link href="/products">الأجهزة</Link>
          <Link href="/track">تتبع الطلب</Link>
          <Link href="/faq">الأسئلة الشائعة</Link>
          <Link href="/privacy">الخصوصية</Link>
          <Link href="/terms">الشروط</Link>
          <Link href="/whatsapp"><WhatsAppIcon size={18}/> واتساب</Link>
        </div>
      </div>
      <div className="v2-container v2-footer-bottom">
        <span>© {new Date().getFullYear()} الأمين للأقساط</span>
        <span>التقديم لا يعني الموافقة النهائية، ويتم الرد حسب الدور وضغط المراجعات.</span>
      </div>
    </footer>
  );
}
