import { writeFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { storeConfigured, putObject } from "./object-store.js";

// Where uploaded photos go: the S3-compatible bucket when one is configured
// (lib/object-store.js — what production uses, since deploys can wipe the
// app's own disk), otherwise UPLOAD_DIR on local disk (development). Either
// way the app stores and links the same "/api/photo?f=<name>" address, and
// app/api/photo/route.js serves it from wherever the file lives.
const DIR = process.env.UPLOAD_DIR || "public/assets/uploads";
// Built by simple concatenation below, so it needs its own trailing separator
// ("/" for a path prefix, "=" for a query-string one) — add "/" if whoever set
// it forgot, rather than silently producing a malformed URL like /uploadsabc.jpg.
const rawPrefix = process.env.UPLOAD_PUBLIC_PREFIX || "/api/photo?f=";
const PUBLIC_PREFIX = /[/=]$/.test(rawPrefix) ? rawPrefix : rawPrefix + "/";
const MAX_BYTES = 12 * 1024 * 1024;

const SAFE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"]);
export const IMAGE_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif", ".heic": "image/heic"
};

// The address the app links an uploaded file by (served by app/api/photo).
export function mediaUrl(name) {
  return PUBLIC_PREFIX + name;
}
export const UPLOAD_DIR = DIR;

export async function saveUpload(file) {
  if (file.size > MAX_BYTES) throw new Error("That image is larger than 12 MB.");
  const ext = extname(file.name || "").toLowerCase();
  const name = randomUUID() + (SAFE_EXT.has(ext) ? ext : ".jpg");
  const buf = Buffer.from(await file.arrayBuffer());
  if (storeConfigured()) {
    await putObject(name, buf, IMAGE_TYPES[extname(name)]);
  } else {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, name), buf);
  }
  return PUBLIC_PREFIX + name;
}
