import { AwsClient } from "aws4fetch";

// Photo storage in an S3-compatible bucket — Cloudflare R2 by default, but
// Amazon S3, Backblaze B2 and the like work the same. Unlike the app's own
// disk, a bucket isn't touched by deploys.
//
// Configured with:
//   S3_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com
//                         (Amazon S3: https://s3.<region>.amazonaws.com)
//   S3_BUCKET             the bucket's name
//   S3_ACCESS_KEY_ID      an API token's access key …
//   S3_SECRET_ACCESS_KEY  … and secret, allowed to read and write the bucket
//   S3_REGION             "auto" for R2 (the default); the bucket's region for S3
//   S3_PUBLIC_URL         optional: the bucket's public address (an R2 custom
//                         domain, say). When set, browsers are sent straight
//                         there instead of the app fetching each photo itself.
//
// Objects are addressed path-style: <endpoint>/<bucket>/<key>.

const env = (name) => (process.env[name] || "").trim();

export function storeConfigured() {
  return Boolean(env("S3_ENDPOINT") && env("S3_BUCKET") && env("S3_ACCESS_KEY_ID") && env("S3_SECRET_ACCESS_KEY"));
}

export function publicUrl(key) {
  const base = env("S3_PUBLIC_URL").replace(/\/+$/, "");
  return base ? base + "/" + encodeURIComponent(key) : null;
}

let client;
function aws() {
  if (!client) {
    client = new AwsClient({
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
      service: "s3",
      region: env("S3_REGION") || "auto"
    });
  }
  return client;
}

const objectUrl = (key) =>
  env("S3_ENDPOINT").replace(/\/+$/, "") + "/" + encodeURIComponent(env("S3_BUCKET")) + "/" + encodeURIComponent(key);

async function failure(res, what) {
  const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  return new Error(what + " failed: HTTP " + res.status + (detail ? " — " + detail : ""));
}

export async function putObject(key, body, contentType) {
  const res = await aws().fetch(objectUrl(key), {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      // Keys are random and never reused, so a photo never changes.
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
  if (!res.ok) throw await failure(res, "Storing " + key);
}

// The bucket's response for the object (null when it doesn't exist). The
// caller streams res.body on.
export async function getObject(key, headers = {}) {
  const res = await aws().fetch(objectUrl(key), { headers });
  if (res.status === 404) return null;
  if (!res.ok && res.status !== 304) throw await failure(res, "Fetching " + key);
  return res;
}

export async function objectExists(key) {
  const res = await aws().fetch(objectUrl(key), { method: "HEAD" });
  if (res.status === 404) return false;
  if (!res.ok) throw await failure(res, "Checking " + key);
  return true;
}
