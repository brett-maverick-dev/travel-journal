import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { saveUpload } from "@/lib/storage";
import { db } from "@/lib/db";

// JSON upload endpoint, for a future mobile client. The web UI uses the
// uploadPhotos server action in app/actions.js instead.
export async function POST(req) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const pageId = String(form.get("pageId") || "");
    const page = await db.page.findUnique({ where: { id: pageId }, include: { trip: true } });
    if (!page || page.trip.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const out = [];
    let position = await db.photo.count({ where: { pageId } });
    for (const file of form.getAll("photos")) {
      if (!file || typeof file.arrayBuffer !== "function") continue;
      const url = await saveUpload(file);
      out.push(await db.photo.create({ data: { pageId, url, position: position++ } }));
    }
    return NextResponse.json({ photos: out });
  } catch (err) {
    const status = err.message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
