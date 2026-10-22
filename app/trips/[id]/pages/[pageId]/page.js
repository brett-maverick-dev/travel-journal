import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import Field from "@/components/Field";
import Photos from "@/components/Photos";
import Comments from "@/components/Comments";
import DeletePageButton from "@/components/DeletePageButton";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { updatePage } from "@/app/actions";
import { fmt, inputDate, tagList } from "@/lib/format";
import { tripRole, abilities } from "@/lib/permissions";

export default async function ActivityPage({ params }) {
  const { id, pageId } = await params;
  const user = await currentUser();
  if (!user) redirect("/signin");

  const page = await db.page.findUnique({
    where: { id: pageId },
    include: {
      trip: true,
      photos: { orderBy: { position: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, handle: true, avatarUrl: true } } } }
    }
  });
  if (!page || page.tripId !== id) notFound();
  const role = await tripRole(page.trip, user.id, db);
  if (!role) notFound();
  const may = abilities(role);
  const parent = page.parentId ? await db.page.findUnique({ where: { id: page.parentId } }) : null;

  return (
    <>
      <Nav user={user} active="trips" />
      <div className="page-shell" style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <Link href={"/trips/" + id + (parent ? "?p=" + parent.id : "")} className="btn btn-ghost">
            <i className="ph ph-arrow-left" />{parent?.title || "Back to trip"}
          </Link>
          {may.delete && <DeletePageButton pageId={page.id} confirmLabel={page.title ? '"' + page.title + '"' : "this page"} />}
        </div>

        <div className="card-kicker">Activity page · {page.trip.name}</div>
        {may.edit ? (
          <>
            <Field quiet value={page.title} save={updatePage.bind(null, page.id, "title")} draftKey={"page:" + page.id + ":title"}
              style={{ padding: "2px 12px", margin: "6px -12px 10px", width: "calc(100% + 24px)", fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 38, minHeight: "auto", letterSpacing: "-0.015em" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, maxWidth: 520 }}>
              <Field quiet value={page.time || ""} placeholder="Time" save={updatePage.bind(null, page.id, "time")} style={{ fontSize: 12, minHeight: 32, width: 110 }} />
              <Field quiet value={page.place} placeholder="Place" save={updatePage.bind(null, page.id, "place")} style={{ fontSize: 12, minHeight: 32, width: 180 }} />
              <Field quiet type="date" value={inputDate(page.date)} save={updatePage.bind(null, page.id, "date")} style={{ fontSize: 12, minHeight: 32, width: 150 }} />
            </div>
          </>
        ) : (
          <>
            <h1 style={{ margin: "6px 0 6px", fontSize: 38, letterSpacing: "-0.015em" }}>{page.title}</h1>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
              {[page.time, page.place, fmt(page.date)].filter(Boolean).join(" · ")}
            </div>
          </>
        )}

        {(may.upload || page.photos.length > 0) && (
          <Photos pageId={page.id} photos={page.photos} canUpload={may.upload} canEditAll={may.edit} meId={user.id} ownerId={page.trip.userId} />
        )}

        {may.edit ? (
          <>
            <div style={{ marginTop: 20 }}>
              <Field quiet as="textarea" value={page.notes} save={updatePage.bind(null, page.id, "notes")} draftKey={"page:" + page.id + ":notes"}
                placeholder="Why this one deserves its own page…"
                style={{ minHeight: 200, fontSize: 16, lineHeight: 1.7, padding: "10px 12px", margin: "0 -12px", width: "calc(100% + 24px)" }} />
            </div>
            <div style={{ marginTop: 14, maxWidth: 420 }}>
              <Field quiet value={page.tags} placeholder="Tags, comma separated" save={updatePage.bind(null, page.id, "tags")} draftKey={"page:" + page.id + ":tags"} style={{ fontSize: 12, minHeight: 32 }} />
            </div>
          </>
        ) : (
          <div style={{ marginTop: 20 }}>
            {page.notes.split("\n").filter(Boolean).map((para, i) => (
              <p key={i} style={{ fontSize: 16, lineHeight: 1.7, maxWidth: "68ch" }}>{para}</p>
            ))}
          </div>
        )}
        {tagList(page.tags).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {tagList(page.tags).map((t) => <span className="tag tag-accent" key={t}>{t}</span>)}
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          <Comments pageId={page.id} comments={page.comments} meId={user.id} canModerate={may.delete} />
        </div>
      </div>
    </>
  );
}
