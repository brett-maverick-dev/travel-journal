import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import TripMap from "@/components/TripMap";
import Field from "@/components/Field";
import Photos from "@/components/Photos";
import VisibilityToggle from "./VisibilityToggle";
import CoverUpload from "./CoverUpload";
import AddButton from "./AddButton";
import DeleteTripButton from "./DeleteTripButton";
import DeletePageButton from "@/components/DeletePageButton";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { updateDestination, updatePage, renameTrip, addDestination, addDayPage, addActivityPage } from "@/app/actions";
import { fmtRange, inputDate, nights, tagList, TRANSPORT, TRANSPORT_ICON } from "@/lib/format";

export default async function TripPage({ params }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/signin");

  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      destinations: { orderBy: { position: "asc" } },
      pages: { orderBy: [{ position: "asc" }, { date: "asc" }], include: { photos: { orderBy: { position: "asc" } } } }
    }
  });
  if (!trip || trip.userId !== user.id) notFound();

  const days = trip.pages.filter((p) => p.kind === "DAY");
  const activitiesFor = (dayId) => trip.pages.filter((p) => p.kind === "ACTIVITY" && p.parentId === dayId);
  const mapTrips = [{
    id: trip.id, name: trip.name, country: trip.country, coverUrl: trip.coverUrl,
    dateRange: fmtRange(trip.startDate, trip.endDate), href: "/trips/" + trip.id,
    stops: trip.destinations.map((d) => ({ name: d.name, lat: d.lat, lng: d.lng }))
  }];

  return (
    <>
      <Nav email={user.email} active="trips" />

      <div style={{ position: "relative", height: 340, overflow: "hidden", background: "var(--color-neutral-900)" }}>
        {trip.coverUrl
          ? <img src={trip.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ position: "absolute", inset: 0 }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, var(--color-bg) 2%, color-mix(in srgb, var(--color-bg) 55%, transparent) 45%, transparent)" }} />
        <div style={{ position: "absolute", left: 34, top: 22, display: "flex", gap: 8 }}>
          <Link href="/trips" className="btn btn-secondary" style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
            <i className="ph ph-arrow-left" />All trips
          </Link>
          <CoverUpload tripId={trip.id} hasCover={Boolean(trip.coverUrl)} />
          <DeleteTripButton tripId={trip.id} tripName={trip.name}
            style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }} />
        </div>
        <div style={{ position: "absolute", left: 34, right: 34, bottom: 26, display: "flex", alignItems: "flex-end", gap: 26, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div className="card-kicker">{trip.country || trip.destinations[0]?.name}</div>
            <Field value={trip.name} save={renameTrip.bind(null, trip.id)}
              style={{ border: 0, background: "transparent", padding: 0, margin: "4px 0 6px", fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 46, minHeight: "auto", letterSpacing: "-0.015em", width: "100%" }} />
            <div className="text-muted" style={{ fontSize: 14 }}>
              {fmtRange(trip.startDate, trip.endDate)} · {trip.destinations.length} destinations · {trip.pages.length} pages
            </div>
          </div>
          <VisibilityToggle tripId={trip.id} visibility={trip.visibility} shareUrl={"/u/" + user.handle + "/" + trip.id} />
        </div>
      </div>

      <div className="page-shell split" style={{ display: "grid", gridTemplateColumns: "308px minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
        <div className="spine" style={{ position: "sticky", top: 86, display: "flex", flexDirection: "column", gap: 20 }}>
          <TripMap trips={mapTrips} height={186} only />

          <div>
            <h6 className="text-muted" style={{ margin: "0 0 12px" }}>Route</h6>
            {trip.destinations.map((d, i) => (
              <div key={d.id}>
                {i > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", height: 38 }}>
                      <span style={{ width: 1, flex: 1, background: "var(--color-divider)" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--color-neutral-400)" }}>
                      <i className={"ph " + (TRANSPORT_ICON[d.transport] || "ph-path")} style={{ fontSize: 16, color: "var(--color-accent)" }} />
                      <span>{d.transport}{d.detail ? " · " + d.detail : ""}</span>
                    </div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "center", paddingTop: 11 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent)" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6 }}>
                    <Field value={d.name} save={updateDestination.bind(null, d.id, "name")}
                      style={{ borderColor: "transparent", background: "transparent", padding: "2px 4px", fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 16, minHeight: "auto" }} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <Field type="date" value={inputDate(d.arrive)} save={updateDestination.bind(null, d.id, "arrive")}
                        style={{ fontSize: 11, minHeight: 30, padding: "3px 6px" }} />
                      <Field type="date" value={inputDate(d.depart)} save={updateDestination.bind(null, d.id, "depart")}
                        style={{ fontSize: 11, minHeight: 30, padding: "3px 6px" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Field as="select" options={TRANSPORT} value={d.transport}
                        save={updateDestination.bind(null, d.id, "transport")}
                        style={{ fontSize: 12, minHeight: 30, padding: "3px 6px", flex: 1 }} />
                      <span style={{ fontSize: 11, color: "var(--color-accent-300)", whiteSpace: "nowrap" }}>{nights(d.arrive, d.depart)}</span>
                    </div>
                    {d.lat == null && (
                      <span className="text-muted" style={{ fontSize: 10 }}>Not found on the map — try a fuller place name.</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <AddButton action={addDestination.bind(null, trip.id)} label="Add destination"
              style={{ marginLeft: 36, marginTop: 10, padding: "8px 12px", fontSize: 12 }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
          {days.map((p) => (
            <div key={p.id} id={"page-" + p.id} style={{ scrollMarginTop: 96 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Field type="date" value={inputDate(p.date)} save={updatePage.bind(null, p.id, "date")}
                  style={{ fontSize: 11, minHeight: 28, padding: "3px 6px", width: 132 }} />
                <Field value={p.place} placeholder="Place" save={updatePage.bind(null, p.id, "place")}
                  style={{ fontSize: 11, minHeight: 28, padding: "3px 6px", width: 150 }} />
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {[p.weather, p.spend, p.steps].filter(Boolean).join("  ·  ")}
                </div>
                <DeletePageButton pageId={p.id} confirmLabel={'"' + p.title + '"'} compact
                  style={{ marginLeft: "auto" }} />
              </div>
              <Field value={p.title} save={updatePage.bind(null, p.id, "title")}
                style={{ border: 0, background: "transparent", padding: 0, fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 31, minHeight: "auto", letterSpacing: "-0.015em", margin: "6px 0 14px" }} />
              <Field as="textarea" value={p.notes} save={updatePage.bind(null, p.id, "notes")}
                placeholder="What happened today?"
                style={{ minHeight: 200, fontSize: 15, lineHeight: 1.65, padding: "14px 16px" }} />

              <div style={{ marginTop: 14 }}>
                <Photos pageId={p.id} photos={p.photos} canEdit />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 14 }}>
                <Field value={p.weather} placeholder="Weather" save={updatePage.bind(null, p.id, "weather")} style={{ fontSize: 12, minHeight: 32 }} />
                <Field value={p.spend} placeholder="Spend" save={updatePage.bind(null, p.id, "spend")} style={{ fontSize: 12, minHeight: 32 }} />
                <Field value={p.tags} placeholder="Tags, comma separated" save={updatePage.bind(null, p.id, "tags")} style={{ fontSize: 12, minHeight: 32 }} />
              </div>
              {tagList(p.tags).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {tagList(p.tags).map((t) => <span className="tag tag-outline" key={t}>{t}</span>)}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 16 }}>
                {activitiesFor(p.id).map((a) => (
                  <Link key={a.id} href={"/trips/" + trip.id + "/pages/" + a.id} className="row-btn"
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", textDecoration: "none", color: "inherit" }}>
                    <i className="ph ph-bookmark-simple" style={{ fontSize: 18, color: "var(--color-accent)" }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 15 }}>{a.title}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>{[a.time, a.place].filter(Boolean).join(" · ")}</span>
                    </span>
                    <i className="ph ph-arrow-up-right" style={{ color: "var(--color-neutral-500)" }} />
                  </Link>
                ))}
                <AddButton action={addActivityPage.bind(null, trip.id, p.id)}
                  label="Break an activity out onto its own page"
                  style={{ border: 0, padding: "12px 14px", fontSize: 13, justifyContent: "flex-start" }} />
              </div>
            </div>
          ))}

          <AddButton action={addDayPage.bind(null, trip.id)} label="Add a page"
            style={{ padding: 16, fontSize: 13 }} />
        </div>
      </div>
    </>
  );
}
