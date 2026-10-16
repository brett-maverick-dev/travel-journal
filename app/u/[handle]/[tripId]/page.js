import { notFound } from "next/navigation";
import Link from "next/link";
import TripMap from "@/components/TripMap";
import BuddyActions from "@/app/buddies/BuddyActions";
import TripJournal from "@/components/TripJournal";
import Photos from "@/components/Photos";
import { db } from "@/lib/db";
import { withDepartureCoords } from "@/lib/geo";
import { currentUser } from "@/lib/session";
import { fmtRange, mapStops, coverStyle, coverFrame } from "@/lib/format";
import { readOnlyJournal } from "@/components/readOnlyJournal";

export async function generateMetadata({ params }) {
  const { tripId } = await params;
  const trip = await db.trip.findUnique({ where: { id: tripId } });
  return { title: trip && trip.visibility === "PUBLIC" ? trip.name + " — Trekkster" : "Trekkster" };
}

// Read-only public view. Private trips 404 here, and pages flagged hidden are
// withheld even when the trip itself is public.
export default async function PublicTrip({ params, searchParams }) {
  const { handle, tripId } = await params;
  const { d: wantDest, p: wantPage } = await searchParams;
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      user: true,
      destinations: { orderBy: { position: "asc" } },
      layovers: { orderBy: { position: "asc" } },
      pages: { where: { hidden: false }, orderBy: [{ position: "asc" }, { date: "asc" }], include: { photos: { orderBy: { position: "asc" } } } }
    }
  });
  if (!trip || trip.visibility !== "PUBLIC" || trip.user.handle !== handle) notFound();

  const viewer = await currentUser();
  let buddyRow = null;
  if (viewer && viewer.id !== trip.user.id) {
    buddyRow = await db.buddy.findFirst({
      where: { OR: [
        { requesterId: viewer.id, addresseeId: trip.user.id },
        { requesterId: trip.user.id, addresseeId: viewer.id }
      ] }
    });
  }

  const journal = readOnlyJournal(trip, {
    wantDest, wantPage,
    photosFor: (p) => (p.photos.length ? <Photos pageId={p.id} photos={p.photos} /> : null)
  });
  const mapTrips = [{
    id: trip.id, name: trip.name, country: trip.country, coverUrl: trip.coverUrl, coverFrame: coverFrame(trip),
    dateRange: fmtRange(trip.startDate, trip.endDate), href: "#",
    stops: mapStops(await withDepartureCoords(trip))
  }];

  return (
    <>
      <div style={{ position: "relative", height: 320, overflow: "hidden", background: "var(--color-neutral-900)" }}>
        {trip.coverUrl && <img src={trip.coverUrl} alt="" style={coverStyle(trip)} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, var(--color-bg) 2%, color-mix(in srgb, var(--color-bg) 55%, transparent) 45%, transparent)" }} />
        <div style={{ position: "absolute", left: 34, right: 34, bottom: 26, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div className="card-kicker">{trip.country}</div>
            <h1 style={{ margin: "4px 0 6px", fontSize: 44 }}>{trip.name}</h1>
            <div className="text-muted" style={{ fontSize: 14 }}>
              {fmtRange(trip.startDate, trip.endDate)} · a journal by {trip.user.handle}
            </div>
          </div>
          {viewer && viewer.id !== trip.user.id && (
            <BuddyActions targetId={trip.user.id} status={buddyRow?.status}
              isRequester={buddyRow?.requesterId === viewer.id} rowId={buddyRow?.id} />
          )}
        </div>
      </div>

      <TripJournal
        map={<TripMap trips={mapTrips} height={186} only />}
        {...journal}
        emptyHint="Nothing written for this stop yet."
        stickyTop={30}
      />
      <p className="text-muted page-shell" style={{ fontSize: 12, paddingTop: 0 }}>
        Kept in Trekkster. <Link href="/signup">Start your own journal</Link>.
      </p>
    </>
  );
}
