import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyWhatsAppAdminRedirect() {
  redirect("/admin/whatsapp-control");
}
