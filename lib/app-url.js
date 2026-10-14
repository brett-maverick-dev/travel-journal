import { headers } from "next/headers";

// The site's public origin, for links in emails. APP_URL wins when set
// (e.g. https://trekkster.app); otherwise it's taken from the request, using
// the forwarded host/protocol a hosting proxy passes along.
export async function appUrl() {
  const fixed = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return proto + "://" + host;
}
