import { NextResponse } from "next/server";

// The SQLite database and its backups live in public/assets/data (the one
// directory the host keeps between deploys), and Next serves public/ as static
// files. Keep them unreachable; server.mjs blocks the same paths in production.
export function middleware() {
  return new NextResponse("Not found", { status: 404 });
}

export const config = { matcher: "/assets/data/:path*" };
