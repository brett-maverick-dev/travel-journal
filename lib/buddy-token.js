import { SignJWT, jwtVerify } from "jose";

// The token in a buddy-request email's Accept / Decline / Block links. It
// names one request and the person it was sent to, so it can only ever
// answer that request, and only while it's still pending (checked when it's
// used). Signed with a key of its own, derived from SESSION_SECRET, so it
// can't be mistaken for — or used as — a session.
const AUDIENCE = "buddy-response";
const key = () => new TextEncoder().encode((process.env.SESSION_SECRET || "dev-only-insecure-secret") + "|buddy-email");

export function signBuddyToken(requestId, addresseeId) {
  return new SignJWT({ r: requestId, u: addresseeId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
}

// { requestId, addresseeId } — or null if it's malformed, tampered with, or expired.
export async function verifyBuddyToken(token) {
  try {
    const { payload } = await jwtVerify(String(token || ""), key(), { audience: AUDIENCE });
    if (typeof payload.r !== "string" || typeof payload.u !== "string") return null;
    return { requestId: payload.r, addresseeId: payload.u };
  } catch {
    return null;
  }
}
