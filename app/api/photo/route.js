import { createReadStream, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { Readable } from "node:stream";
import { storeConfigured, getObject, publicUrl } from "@/lib/object-store";
import { IMAGE_TYPES } from "@/lib/storage";
import { VIDEO_TYPES } from "@/lib/media";

// Serves an uploaded photo or video by name (/api/photo?f=<name>) from
// wherever it lives: the bucket when one is configured — redirecting to its
// public address when there is one, streaming it through otherwise — and
// local disk for development. (Next only serves files present in public/
// when the server starts, so runtime uploads can't go through the static
// handler.)
//
// Byte ranges are honoured (206 Partial Content): video players fetch a clip
// in pieces to seek, and Safari won't play video without them.
const DIR = process.env.UPLOAD_DIR || "public/assets/uploads";
const FOREVER = "public, max-age=31536000, immutable"; // names are random and never reused
const TYPES = { ...IMAGE_TYPES, ...VIDEO_TYPES };

// "bytes=100-199" / "bytes=100-" / "bytes=-200" against `size` →
// { start, end } (inclusive), "invalid", or null for no (single) range.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  return start > end || start >= size ? "invalid" : { start, end };
}

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get("f") || "";
  const name = basename(raw);            // strips ../ — cannot escape DIR or pick another key
  const type = TYPES[extname(name).toLowerCase()];
  if (!name || !type) return new Response("Not found", { status: 404 });
  const range = req.headers.get("range");

  if (storeConfigured()) {
    const direct = publicUrl(name);
    if (direct) return new Response(null, { status: 302, headers: { Location: direct, "Cache-Control": FOREVER } });

    const forward = {};
    if (range) forward.Range = range;
    else if (req.headers.get("if-none-match")) forward["If-None-Match"] = req.headers.get("if-none-match");
    let res;
    try {
      res = await getObject(name, forward);
    } catch (err) {
      if (/HTTP 416/.test(err.message)) return new Response(null, { status: 416 });
      throw err;
    }
    if (res) {
      const pass = (h) => (res.headers.get(h) ? { [h]: res.headers.get(h) } : {});
      if (res.status === 304) return new Response(null, { status: 304, headers: pass("etag") });
      return new Response(res.body, {
        status: res.status, // 200, or 206 for a range
        headers: {
          "Content-Type": type, "Cache-Control": FOREVER, "Accept-Ranges": "bytes",
          ...pass("content-length"), ...pass("content-range"), ...pass("etag")
        }
      });
    }
    // Not in the bucket — fall through to disk, for anything not yet copied up.
  }

  const path = join(DIR, name);
  if (!existsSync(path)) return new Response("Not found", { status: 404 });

  const { size, mtimeMs } = statSync(path);
  const etag = '"' + size.toString(36) + "-" + Math.round(mtimeMs).toString(36) + '"';
  const common = { "Content-Type": type, "Cache-Control": FOREVER, "Accept-Ranges": "bytes", ETag: etag };

  const span = parseRange(range, size);
  if (span === "invalid") return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  if (span) {
    return new Response(Readable.toWeb(createReadStream(path, span)), {
      status: 206,
      headers: { ...common, "Content-Length": String(span.end - span.start + 1), "Content-Range": "bytes " + span.start + "-" + span.end + "/" + size }
    });
  }
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  return new Response(Readable.toWeb(createReadStream(path)), { headers: { ...common, "Content-Length": String(size) } });
}
