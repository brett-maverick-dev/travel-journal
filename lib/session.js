import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

const COOKIE = "meridian_session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-only-insecure-secret");

export async function createSession(userId) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return await db.user.findUnique({ where: { id: String(payload.sub) } });
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user || !user.verified) throw new Error("UNAUTHENTICATED");
  return user;
}

// A user is an admin if the DB flag is set, or their email is listed in
// ADMIN_EMAILS (comma separated) — the latter is how you bootstrap the very
// first admin with no admin panel access yet.
export function isAdminUser(user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  const allowlist = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(String(user.email || "").toLowerCase());
}
