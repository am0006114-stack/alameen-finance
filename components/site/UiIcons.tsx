import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 22, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return <IconBase {...props}><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></IconBase>;
}
export function PhoneIcon(props: IconProps) {
  return <IconBase {...props}><rect x="7" y="2" width="10" height="20" rx="2.4"/><path d="M10 5h4"/><path d="M11.5 18.5h1"/></IconBase>;
}
export function SearchIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></IconBase>;
}
export function TrackIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><path d="m15 16 2 2 3-4"/></IconBase>;
}
export function WhatsAppIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.5c.3 2 2 3.8 4.2 4.7l1.2-1.1 2 .7-.2 1.8c-.2.8-1 1.3-1.8 1.2-4.5-.7-7.9-4.3-8.3-8.4C6 6.6 6.7 6 7.5 6h1.4L9.5 8l-.5.5Z"/></IconBase>;
}
export function ShieldIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 3 4.5 6v5.5c0 4.6 3 7.8 7.5 9.5 4.5-1.7 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></IconBase>;
}
export function ArrowIcon(props: IconProps) {
  return <IconBase {...props}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></IconBase>;
}
export function CheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="m5 12 4 4L19 6"/></IconBase>;
}
export function WalletIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 6h14a2 2 0 0 1 2 2v10H4z"/><path d="M4 6V4h12v2"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></IconBase>;
}
export function CalendarIcon(props: IconProps) {
  return <IconBase {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></IconBase>;
}
export function DocumentIcon(props: IconProps) {
  return <IconBase {...props}><path d="M6 2h9l3 3v17H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></IconBase>;
}
export function FilterIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 5h16M7 12h10M10 19h4"/></IconBase>;
}
export function ChevronDownIcon(props: IconProps) {
  return <IconBase {...props}><path d="m6 9 6 6 6-6"/></IconBase>;
}
export function SparklesIcon(props: IconProps) {
  return <IconBase {...props}><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z"/><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM5 14l.6 1.5L7 16l-1.4.5L5 18l-.6-1.5L3 16l1.4-.5L5 14Z"/></IconBase>;
}
export function TagIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20 13 13 20l-9-9V4h7z"/><circle cx="8" cy="8" r="1"/></IconBase>;
}
export function MenuIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16"/></IconBase>;
}
