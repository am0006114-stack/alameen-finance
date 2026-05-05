import { redirect } from "next/navigation";

export async function GET() {
  const phone = process.env.COMPANY_WHATSAPP_PHONE;

  if (!phone) {
    redirect("/");
  }

  const message = `أهلًا، أريد الاستفسار عن خدمة التقسيط لدى الأمين للأقساط.`;

  redirect(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
}