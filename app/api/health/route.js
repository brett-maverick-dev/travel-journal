export const dynamic = "force-dynamic";

// Lightweight target for platform health checks.
export function GET() {
  return Response.json({ ok: true, at: new Date().toISOString() });
}
