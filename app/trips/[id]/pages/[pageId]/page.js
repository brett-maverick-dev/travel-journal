import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Field from "@/components/Field";
import Photos from "@/components/Photos";
import DeletePageButton from "@/components/DeletePageButton";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { updatePage } from "@/app/actions";
import { inputDate, tagList } from "@/lib/format";

export default async function ActivityPage({ params }) {
  const { id, pageId } = await params;
  const user = await currentUser();
  if (!user) redirect("/signin");

  const page = await db.page.findUnique({
    where: { id: pageId },
    include: { trip: true, photos: { orderBy: { position: "asc" } } }
  });
  if (!page || page.tripId !== id || page.trip.userId !== user.id) notFound();
  const parent = page.parentId ? await db.page.findUnique({ where: { id: page.parentId } }) : null;

  return (
    <>
      <Nav email={user.email} active="trips" />
      <div className="page-shell" style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <Link href={"/trips/" + id + (parent ? "#page-" + parent.id : "")} className="btn btn-ghost">
            <i className="ph ph-arrow-left" />{parent ? parent.title : "Back to trip"}
          </Link>
          <DeletePageButton pageId={page.id} confirmLabel={page.title ? '"' + page.title + '"' : "this page"} />
        </div>

        <div className="card-kicker">Activity page · {page.trip.name}</div>
        <Field value={page.title} save={updatePage.bind(null, page.id, "title")}
          style={{ border: 0, background: "transparent", padding: 0, fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 38, minHeight: "auto", letterSpacing: "-0.015em", margin: "6px 0 10px" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, maxWidth: 520 }}>
          <Field value={page.time || ""} placeholder="Time" save={updatePage.bind(null, page.id, "time")} style={{ fontSize: 12, minHeight: 32, width: 110 }} />
          <Field value={page.place} placeholder="Place" save={updatePage.bind(null, page.id, "place")} style={{ fontSize: 12, minHeight: 32, width: 180 }} />
          <Field type="date" value={inputDate(page.date)} save={updatePage.bind(null, page.id, "date")} style={{ fontSize: 12, minHeight: 32, width: 150 }} />
        </div>

        <Photos pageId={page.id} photos={page.photos} canEdit />

        <div style={{ marginTop: 20 }}>
          <Field as="textarea" value={page.notes} save={updatePage.bind(null, page.id, "notes")}
            placeholder="Why this one deserves its own page…"
            style={{ minHeight: 230, fontSize: 16, lineHeight: 1.7, padding: "16px 18px" }} />
        </div>

        <div style={{ marginTop: 14, maxWidth: 420 }}>
          <Field value={page.tags} placeholder="Tags, comma separated" save={updatePage.bind(null, page.id, "tags")} style={{ fontSize: 12, minHeight: 32 }} />
        </div>
        {tagList(page.tags).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {tagList(page.tags).map((t) => <span className="tag tag-accent" key={t}>{t}</span>)}
          </div>
        )}
      </div>
    </>
  );
}
