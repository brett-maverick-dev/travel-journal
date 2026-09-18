import { writeFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

// Uploads land in public/assets/uploads because that is the one directory
// GoDaddy Node.js Hosting keeps between deployments. Anywhere else in the
// project is wiped on redeploy. For real scale (several instances, CDN) swap
// this file for S3/R2 presigned uploads — the rest of the app only sees the
// returned URL string.
const DIR = process.env.UPLOAD_DIR || "public/assets/uploads";
// Built by simple concatenation below, so it needs its own trailing separator
// ("/" for a path prefix, "=" for a query-string one) — add "/" if whoever set
// it forgot, rather than silently producing a malformed URL like /uploadsabc.jpg.
const rawPrefix = process.env.UPLOAD_PUBLIC_PREFIX || "/api/photo?f=";
const PUBLIC_PREFIX = /[/=]$/.test(rawPrefix) ? rawPrefix : rawPrefix + "/";
const MAX_BYTES = 12 * 1024 * 1024;

const SAFE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);

export async function saveUpload(file) {
  if (file.size > MAX_BYTES) throw new Error("That image is larger than 12 MB.");
  const ext = extname(file.name || "").toLowerCase();
  const name = randomUUID() + (SAFE_EXT.has(ext) ? ext : ".jpg");
  const buf = Buffer.from(await file.arrayBuffer());
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, name), buf);
  return PUBLIC_PREFIX + name;
}
