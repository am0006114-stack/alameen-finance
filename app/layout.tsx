import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ameenfinance.co"),
  title: "الأمين للأقساط | تقسيط هواتف iPhone و Samsung في الأردن",
  description:
    "الأمين للأقساط - تقسيط هواتف iPhone و Samsung في الأردن بخطوات سهلة وسريعة. تقديم أونلاين واستلام من المعرض.",
  applicationName: "الأمين للأقساط",
  keywords: [
    "الأمين للأقساط",
    "تقسيط هواتف",
    "تقسيط ايفون",
    "تقسيط سامسونج",
    "iPhone installments Jordan",
    "Samsung installments Jordan",
    "تقسيط هواتف في الأردن",
    "تمويل هواتف الأردن",
  ],
  alternates: {
    canonical: "https://www.ameenfinance.co",
  },
  openGraph: {
    title: "الأمين للأقساط | تقسيط هواتف iPhone و Samsung في الأردن",
    description:
      "قدّم أونلاين على تقسيط هواتف iPhone و Samsung واستلم جهازك من المعرض بعد الموافقة.",
    url: "https://www.ameenfinance.co",
    siteName: "الأمين للأقساط",
    locale: "ar_JO",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "الأمين للأقساط",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "الأمين للأقساط | تقسيط هواتف iPhone و Samsung في الأردن",
    description:
      "تقسيط هواتف iPhone و Samsung في الأردن بخطوات سهلة وسريعة.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}