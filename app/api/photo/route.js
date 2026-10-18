import { createReadStream, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { Readable } from "node:stream";
import { storeConfigured, getObject, publicUrl } from "@/lib/object-store";
import { IMAGE_TYPES } from "@/lib/storage";

// Serves an uploaded photo by name (/api/photo?f=<name>) from wherever it
// lives: the photo bucket when one is configured — redirecting to its public
// address when there is one, streaming it through otherwise — and local disk
// for development. (Next only serves files present in public/ when the
// server starts, so runtime uploads can't go through the static handler.)
const DIR = process.env.UPLOAD_DIR || "public/assets/uploads";
const FOREVER = "public, max-age=31536000, immutable"; // names are random and never reused

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get("f") || "";
  const name = basename(raw);            // strips ../ — cannot escape DIR or pick another key
  const type = IMAGE_TYPES[extname(name).toLowerCase()];
  if (!name || !type) return new Response("Not found", { status: 404 });

  if (storeConfigured()) {
    const direct = publicUrl(name);
    if (direct) return new Response(null, { status: 302, headers: { Location: direct, "Cache-Control": FOREVER } });

    const inm = req.headers.get("if-none-match");
    const res = await getObject(name, inm ? { "If-None-Match": inm } : {});
    if (res) {
      if (res.status === 304) return new Response(null, { status: 304, headers: { ETag: res.headers.get("etag") || "" } });
      return new Response(res.body, {
        headers: {
          "Content-Type": type,
          ...(res.headers.get("content-length") ? { "Content-Length": res.headers.get("content-length") } : {}),
          "Cache-Control": FOREVER,
          ...(res.headers.get("etag") ? { ETag: res.headers.get("etag") } : {})
        }
      });
    }
    // Not in the bucket — fall through to disk, for anything not yet copied up.
  }

  const path = join(DIR, name);
  if (!existsSync(path)) return new Response("Not found", { status: 404 });

  const { size, mtimeMs } = statSync(path);
  const etag = '"' + size.toString(36) + "-" + Math.round(mtimeMs).toString(36) + '"';
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });

  return new Response(Readable.toWeb(createReadStream(path)), {
    headers: { "Content-Type": type, "Content-Length": String(size), "Cache-Control": FOREVER, ETag: etag }
  });
}
