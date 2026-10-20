import { createHmac, timingSafeEqual } from "node:crypto";

// Development stand-in for a bucket's pre-signed upload URL: when photos are
// stored on local disk, the browser PUTs a video to /api/media-upload with
// this token, which names one file and expires (default 15 minutes).
const key = () => (process.env.SESSION_SECRET || "dev-only-insecure-secret") + "|media-upload";
const sign = (payload) => createHmac("sha256", key()).update(payload).digest("base64url");

export function mediaUploadToken(name, seconds = 900) {
  const payload = name + "." + (Math.floor(Date.now() / 1000) + seconds);
  return payload + "." + sign(payload);
}

// The file name the token allows, or null if it's forged or expired.
export function verifyMediaUploadToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 3) return null;
  const sig = parts.pop(), expires = Number(parts.pop()), name = parts.join(".");
  const expected = sign(name + "." + expires);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return expires * 1000 > Date.now() ? name : null;
}
