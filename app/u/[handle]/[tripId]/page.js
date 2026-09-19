import { notFound } from "next/navigation";
import Link from "next/link";
import TripMap from "@/components/TripMap";
import { db } from "@/lib/db";
import { fmt, fmtRange, nights, tagList, TRANSPORT_ICON } from "@/lib/format";

export async function generateMetadata({ params }) {
  const { tripId } = await params;
  const trip = await db.trip.findUnique({ where: { id: tripId } });
  return { title: trip && trip.visibility === "PUBLIC" ? trip.name + " — Trekkster" : "Trekkster" };
}

// Read-only public view. Private trips 404 here, and pages flagged hidden are
// withheld even when the trip itself is public.
export default async function PublicTrip({ params }) {
  const { handle, tripId } = await params;
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      user: true,
      destinations: { orderBy: { position: "asc" } },
      pages: { where: { hidden: false }, orderBy: [{ position: "asc" }, { date: "asc" }], include: { photos: { orderBy: { position: "asc" } } } }
    }
  });
  if (!trip || trip.visibility !== "PUBLIC" || trip.user.handle !== handle) notFound();

  const days = trip.pages.filter((p) => p.kind === "DAY");
  const mapTrips = [{
    id: trip.id, name: trip.name, country: trip.country, coverUrl: trip.coverUrl,
    dateRange: fmtRange(trip.startDate, trip.endDate), href: "#",
    stops: trip.destinations.map((d) => ({ name: d.name, lat: d.lat, lng: d.lng }))
  }];

  return (
    <>
      <div style={{ position: "relative", height: 320, overflow: "hidden", background: "var(--color-neutral-900)" }}>
        {trip.coverUrl && <img src={trip.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, var(--color-bg) 2%, color-mix(in srgb, var(--color-bg) 55%, transparent) 45%, transparent)" }} />
        <div style={{ position: "absolute", left: 34, right: 34, bottom: 26 }}>
          <div className="card-kicker">{trip.country}</div>
          <h1 style={{ margin: "4px 0 6px", fontSize: 44 }}>{trip.name}</h1>
          <div className="text-muted" style={{ fontSize: 14 }}>
            {fmtRange(trip.startDate, trip.endDate)} · a journal by {trip.user.handle}
          </div>
        </div>
      </div>

      <div className="page-shell split" style={{ display: "grid", gridTemplateColumns: "308px minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
        <div className="spine" style={{ position: "sticky", top: 30, display: "flex", flexDirection: "column", gap: 20 }}>
          <TripMap trips={mapTrips} height={186} only />
          <div>
            <h6 className="text-muted" style={{ margin: "0 0 12px" }}>Route</h6>
            {trip.destinations.map((d, i) => (
              <div key={d.id} style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 14 }}>
                {i > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--color-neutral-400)" }}>
                    <i className={"ph " + (TRANSPORT_ICON[d.transport] || "ph-path")} style={{ fontSize: 15, color: "var(--color-accent)" }} />
                    <span>{d.transport}{d.detail ? " · " + d.detail : ""}</span>
                  </div>
                )}
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 16 }}>{d.name}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{fmt(d.arrive)} – {fmt(d.depart)} · {nights(d.arrive, d.depart)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
          {days.map((p) => {
            const acts = trip.pages.filter((x) => x.kind === "ACTIVITY" && x.parentId === p.id);
            return (
              <article key={p.id}>
                <div className="card-kicker">{fmt(p.date)}{p.place ? " · " + p.place : ""}</div>
                <h2 style={{ margin: "6px 0 12px" }}>{p.title}</h2>
                {p.notes.split("\n").filter(Boolean).map((para, i) => (
                  <p key={i} style={{ fontSize: 15, lineHeight: 1.65, maxWidth: "68ch" }}>{para}</p>
                ))}
                {p.photos.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 8 }}>
                    {p.photos.map((ph) => (
                      <img key={ph.id} src={ph.url} alt={ph.caption} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8 }} />
                    ))}
                  </div>
                )}
                {tagList(p.tags).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {tagList(p.tags).map((t) => <span className="tag tag-outline" key={t}>{t}</span>)}
                  </div>
                )}
                {acts.map((a) => (
                  <section key={a.id} className="card elev-sm" style={{ padding: 20, marginTop: 20, gap: 10 }}>
                    <div className="card-kicker">{[a.time, a.place].filter(Boolean).join(" · ")}</div>
                    <h3 style={{ margin: 0 }}>{a.title}</h3>
                    {a.photos.length > 0 && (
                      <img src={a.photos[0].url} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "cover", borderRadius: 8 }} />
                    )}
                    {a.notes.split("\n").filter(Boolean).map((para, i) => (
                      <p key={i} style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>{para}</p>
                    ))}
                  </section>
                ))}
              </article>
            );
          })}
          <p className="text-muted" style={{ fontSize: 12 }}>
            Kept in Trekkster. <Link href="/signup">Start your own journal</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
