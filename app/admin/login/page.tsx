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
      className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-4 py-10"
    >
      <div className="w-full max-w-md rounded-[32px] border border-[#eadfce] bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#111827] text-2xl font-black text-white">
            أ
          </div>

          <h1 className="text-3xl font-black text-[#111827]">
            دخول الإدارة
          </h1>

          <p className="mt-3 text-sm leading-7 text-gray-500">
            لوحة تحكم الأمين للأقساط — للموظفين المصرّح لهم فقط.
          </p>
        </div>

        {hasError && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            كلمة السر غير صحيحة. جرّب مرة ثانية.
          </div>
        )}

        <form action={loginAction} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              كلمة سر الأدمن
            </label>

            <input
              name="password"
              type="password"
              required
              placeholder="أدخل كلمة السر"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-right text-gray-900 outline-none transition focus:border-[#111827] focus:bg-white"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-[#111827] px-5 py-4 text-base font-black text-white shadow-lg transition hover:bg-black"
          >
            دخول لوحة الإدارة
          </button>
        </form>
      </div>
    </main>
  );
}