import { redirect } from "next/navigation";

export async function GET() {
  const rawPhone = process.env.COMPANY_WHATSAPP_PHONE;

  if (!rawPhone) {
    redirect("/");
  }

  const phone = rawPhone.replace(/\D/g, "");

  const message =
    "أهلًا، أريد الاستفسار عن خدمة تقسيط الهواتف لدى الأمين للأقساط والتمويل. أود معرفة الشروط وطريقة التقديم.";

  redirect(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
}