import Link from "next/link";
import { HomeIcon, PhoneIcon, TrackIcon, WhatsAppIcon } from "./UiIcons";

type Props = { active?: "home" | "products" | "track" };
export default function MobileBottomNav({ active }: Props) {
  const items = [
    { key: "home", href: "/", label: "الرئيسية", Icon: HomeIcon },
    { key: "products", href: "/products", label: "الأجهزة", Icon: PhoneIcon },
    { key: "track", href: "/track", label: "طلبك", Icon: TrackIcon },
    { key: "whatsapp", href: "/whatsapp", label: "واتساب", Icon: WhatsAppIcon },
  ] as const;
  return (
    <nav className="v2-bottom-nav" aria-label="تنقل الهاتف">
      {items.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href} className={active === key ? "is-active" : ""}>
          <Icon size={21}/><span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
