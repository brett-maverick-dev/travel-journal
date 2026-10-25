import { SignJWT, jwtVerify } from "jose";

// The token in the "your email was changed" notice's undo link. It names the
// account and the address it moved away from, and goes only to that address —
// so whoever can read the old inbox can take the account back there, for a
// week. Signed with a key of its own, derived from SESSION_SECRET, so it
// can't be mistaken for — or used as — a session.
const AUDIENCE = "email-undo";
const key = () => new TextEncoder().encode((process.env.SESSION_SECRET || "dev-only-insecure-secret") + "|email-undo");

export function signEmailUndoToken(userId, oldEmail) {
  return new SignJWT({ u: userId, e: oldEmail })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());
}

// { userId, email } — or null if it's malformed, tampered with, or expired.
export async function verifyEmailUndoToken(token) {
  try {
    const { payload } = await jwtVerify(String(token || ""), key(), { audience: AUDIENCE });
    if (typeof payload.u !== "string" || typeof payload.e !== "string") return null;
    return { userId: payload.u, email: payload.e };
  } catch {
    return null;
  }
}
