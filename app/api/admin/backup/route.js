import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { currentUser, isAdminUser } from "@/lib/session";
import { backupPath } from "@/lib/backup";

export async function GET(req) {
  const user = await currentUser();
  if (!isAdminUser(user)) return new Response("Not found", { status: 404 });

  const name = new URL(req.url).searchParams.get("f") || "";
  const path = await backupPath(name); // only resolves names that are actually in the backups directory
  if (!path) return new Response("Not found", { status: 404 });

  return new Response(Readable.toWeb(createReadStream(path)), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="' + name + '"'
    }
  });
}
