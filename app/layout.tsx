import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ameenfinance.co"),
  title: "الأمين للأقساط | أجهزة وهواتف بالأقساط في الأردن",
  description:
    "الأمين للأقساط — اختر جهازك وقدّم طلب التقسيط إلكترونيًا، مع متابعة واضحة عبر واتساب وتسليم من المكتب بموعد رسمي بعد الموافقة النهائية.",
  applicationName: "الأمين للأقساط",
  keywords: [
    "الأمين للأقساط",
    "تقسيط أجهزة",
    "تقسيط هواتف",
    "تقسيط iPhone",
    "تقسيط Samsung",
    "هواتف بالأقساط في الأردن",
  ],
  alternates: { canonical: "https://www.ameenfinance.co" },
  openGraph: {
    title: "الأمين للأقساط | اختر جهازك وابدأ طلبك",
    description: "اختيار الجهاز، حساب قسط تقريبي، تقديم إلكتروني ومتابعة عبر واتساب.",
    url: "https://www.ameenfinance.co",
    siteName: "الأمين للأقساط",
    locale: "ar_JO",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "الأمين للأقساط" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "الأمين للأقساط",
    description: "اختر جهازك وابدأ طلب التقسيط بخطوات واضحة.",
    images: ["/og-image.jpg"],
  },
  icons: { icon: "/favicon.ico", shortcut: "/favicon.ico", apple: "/favicon.ico" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
