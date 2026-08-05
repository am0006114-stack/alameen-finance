import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProductById } from "@/lib/products";
import ApplyClient from "./ApplyClient";

type PageProps = {
  searchParams?: Promise<{
    product?: string | string[];
    months?: string | string[];
    downPayment?: string | string[];
  }>;
};

export default async function ApplyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawProduct = Array.isArray(params?.product) ? params?.product[0] : params?.product;
  const productId = String(rawProduct || "").trim();

  if (!productId || !getProductById(productId)) {
    redirect("/products?reason=device-required#devices");
  }

  return (
    <Suspense fallback={<ApplyLoading />}>
      <ApplyClient />
    </Suspense>
  );
}

function ApplyLoading() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[radial-gradient(circle_at_top,#2b1607_0%,#050505_38%,#000_100%)] px-4 py-10 text-white"
    >
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] border border-orange-500/20 bg-black/70 p-8 shadow-2xl">
          <div className="mb-4 h-8 w-48 animate-pulse rounded-full bg-orange-500/20" />
          <div className="h-12 w-3/4 animate-pulse rounded-2xl bg-zinc-800" />
          <div className="mt-5 h-6 w-1/2 animate-pulse rounded-xl bg-zinc-800" />
        </div>
      </div>
    </main>
  );
}
