import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    phone?: string;
  }>;
};

export default async function DashboardWhatsAppRedirectPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const phone = String(resolvedSearchParams?.phone || "").trim();

  if (phone) {
    redirect(`/admin/whatsapp?phone=${encodeURIComponent(phone)}`);
  }

  redirect("/admin/whatsapp");
}