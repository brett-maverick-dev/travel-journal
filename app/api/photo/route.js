import { createReadStream, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { Readable } from "node:stream";

// Next only serves files present in public/ at BUILD time. Photos are written
// at runtime, so the static handler 404s on them — stream from disk instead.
const DIR = process.env.UPLOAD_DIR || "public/assets/uploads";

const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
  ".heic": "image/heic"
};

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get("f") || "";
  const name = basename(raw);            // strips ../ — cannot escape DIR
  const ext = extname(name).toLowerCase();
  if (!name || !TYPES[ext]) return new Response("Not found", { status: 404 });

  const path = join(DIR, name);
  if (!existsSync(path)) return new Response("Not found", { status: 404 });

  const { size, mtimeMs } = statSync(path);
  const etag = '"' + size.toString(36) + "-" + Math.round(mtimeMs).toString(36) + '"';
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });

  return new Response(Readable.toWeb(createReadStream(path)), {
    headers: {
      "Content-Type": TYPES[ext],
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag
    }
  });
}
