import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { verifyMediaUploadToken } from "@/lib/media-token";
import { UPLOAD_DIR } from "@/lib/storage";
import { MAX_VIDEO_BYTES } from "@/lib/media";

// Local-disk stand-in for uploading a video straight to the bucket (see
// startVideoUpload in app/actions.js). Production uses a pre-signed bucket
// URL instead and never comes here.
export async function PUT(req) {
  const name = verifyMediaUploadToken(new URL(req.url).searchParams.get("t"));
  if (!name || name !== basename(name)) return new Response("Forbidden", { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > MAX_VIDEO_BYTES) return new Response("Too large", { status: 413 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const path = join(UPLOAD_DIR, name);
  let bytes = 0;
  const limit = new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_VIDEO_BYTES) controller.error(new Error("too large"));
      else controller.enqueue(chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(req.body.pipeThrough(limit)), createWriteStream(path));
  } catch {
    await unlink(path).catch(() => {});
    return new Response("Too large", { status: 413 });
  }
  return new Response(null, { status: 200 });
}
