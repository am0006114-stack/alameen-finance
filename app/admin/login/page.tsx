import { redirect } from "next/navigation";
import { setAdminSession, isAdminLoggedIn } from "@/lib/adminAuth";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const loggedIn = await isAdminLoggedIn();

  if (loggedIn) {
    redirect("/admin");
  }

  const params = await searchParams;
  const hasError = params?.error === "1";

  async function loginAction(formData: FormData) {
    "use server";

    const password = String(formData.get("password") || "");

    if (!process.env.ADMIN_PASSWORD) {
      redirect("/admin/login?error=1");
    }

    if (password !== process.env.ADMIN_PASSWORD) {
      redirect("/admin/login?error=1");
    }

    await setAdminSession();
    redirect("/admin");
  }

  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-[#f7f3e8]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-120px] top-[-120px] h-[320px] w-[320px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
        <div className="absolute left-[-110px] top-[260px] h-[300px] w-[300px] rounded-full bg-[#3fae65]/10 blur-3xl" />
        <div className="absolute bottom-[-100px] right-[22%] h-[280px] w-[280px] rounded-full bg-[#d6b56b]/10 blur-3xl" />
      </div>

      <div className="site-shell pattern-lines relative w-full max-w-md rounded-[32px] p-1 shadow-2xl">
        <div className="rounded-[30px] border border-[rgba(214,181,107,0.14)] p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(214,181,107,0.26)] bg-[rgba(214,181,107,0.10)] text-2xl font-black text-[#f3dfac] shadow-lg">
              أ
            </div>

            <p className="gold-chip mx-auto mb-4 inline-flex rounded-full px-4 py-2 text-xs font-black">
              لوحة الإدارة
            </p>

            <h1 className="text-3xl font-black text-white">دخول الإدارة</h1>

            <p className="mt-3 text-sm font-bold leading-7 text-[#cbd6cb]">
              لوحة تحكم الأمين للأقساط — للموظفين المصرّح لهم فقط.
            </p>
          </div>

          {hasError && (
            <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-950/25 px-4 py-3 text-sm font-bold text-red-200">
              كلمة السر غير صحيحة. جرّب مرة ثانية.
            </div>
          )}

          <form action={loginAction} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-black text-[#f3dfac]">
                كلمة سر الأدمن
              </label>

              <input
                name="password"
                type="password"
                required
                placeholder="أدخل كلمة السر"
                className="w-full rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(3,18,14,0.58)] px-4 py-4 text-right text-white outline-none transition placeholder:text-[#8d998f] focus:border-[#d6b56b] focus:ring-4 focus:ring-[#d6b56b]/10"
              />
            </div>

            <button
              type="submit"
              className="green-button w-full rounded-2xl px-5 py-4 text-base font-black shadow-lg transition"
            >
              دخول لوحة الإدارة
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-[rgba(214,181,107,0.16)] bg-[rgba(255,255,255,0.035)] p-4 text-center text-xs font-bold leading-6 text-[#aeb9af]">
            هذه الصفحة مخصصة لإدارة الطلبات ومراجعة بيانات التمويل فقط.
          </div>
        </div>
      </div>
    </main>
  );
}