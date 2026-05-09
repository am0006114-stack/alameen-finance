import { Suspense } from "react";
import GuarantorClient from "./GuarantorClient";

export default function GuarantorPage() {
  return (
    <Suspense
      fallback={
        <main
          dir="rtl"
          className="min-h-screen bg-[#03120e] px-4 py-10 text-white"
        >
          <div className="mx-auto max-w-3xl rounded-[2rem] border border-[rgba(214,181,107,0.18)] bg-[rgba(3,18,14,0.74)] p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 h-14 w-14 animate-spin rounded-full border-4 border-[#69d97b] border-t-transparent" />
            <h1 className="text-2xl font-black">جاري تجهيز نموذج الكفيل...</h1>
            <p className="mt-3 text-sm leading-7 text-[#d7ddd5]">
              يرجى الانتظار قليلاً.
            </p>
          </div>
        </main>
      }
    >
      <GuarantorClient />
    </Suspense>
  );
}
