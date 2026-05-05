import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "alameen_admin_session";

export async function isAdminLoggedIn() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return false;
  }

  return sessionCookie.value === process.env.ADMIN_SESSION_SECRET;
}

export async function setAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: process.env.ADMIN_SESSION_SECRET || "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();

  cookieStore.delete(ADMIN_COOKIE_NAME);
}