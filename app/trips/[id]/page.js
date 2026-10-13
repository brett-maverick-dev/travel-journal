import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import TripMap from "@/components/TripMap";
import Field from "@/components/Field";
import Photos from "@/components/Photos";
import VisibilityToggle from "./VisibilityToggle";
import CoverUpload from "./CoverUpload";
import CoverImage from "./CoverImage";
import AddButton from "./AddButton";
import DeleteTripButton from "./DeleteTripButton";
import DeletePageButton from "@/components/DeletePageButton";
import TripBuddies from "./TripBuddies";
import DestinationActions from "./DestinationActions";
import RemoveLayoverButton from "./RemoveLayoverButton";
import TripJournal from "@/components/TripJournal";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { withDepartureCoords } from "@/lib/geo";
import { updateDestination, updatePage, renameTrip, addDestination, addDayPage, addActivityPage, updateDeparture, updateArrival, addLayover, updateLayover, updateReturn } from "@/app/actions";
import { fmt, fmtRange, inputDate, nights, tagList, TRANSPORT, TRANSPORT_ICON, mapStops, coverFrame } from "@/lib/format";
import { groupPagesByDestination, initialDestination, OTHER_GROUP, DEPARTURE_GROUP, RETURN_GROUP } from "@/lib/pages";

export default async function TripPage({ params, searchParams }) {
  const { id } = await params;
  const { d: wantDest, p: wantPage } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/signin");

  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      user: true,
      destinations: { orderBy: { position: "asc" } },
      layovers: { orderBy: { position: "asc" } },
      pages: { orderBy: [{ position: "asc" }, { date: "asc" }], include: { photos: { orderBy: { position: "asc" } } } },
      buddies: { include: { user: true }, orderBy: { addedAt: "asc" } }
    }
  });
  const isOwner = trip?.userId === user.id;
  const isCollaborator = isOwner || trip?.buddies.some((b) => b.userId === user.id);
  if (!trip || !isCollaborator) notFound();

  const availableBuddies = isOwner
    ? await db.buddy.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: user.id }, { addresseeId: user.id }]
        },
        include: { requester: true, addressee: true }
      }).then((rows) => rows
        .map((r) => (r.requesterId === user.id ? r.addressee : r.requester))
        .filter((u) => !trip.buddies.some((b) => b.userId === u.id)))
    : [];

  const days = trip.pages.filter((p) => p.kind === "DAY");
  const activitiesFor = (dayId) => trip.pages.filter((p) => p.kind === "ACTIVITY" && p.parentId === dayId);
  const { groups, other, departure: departurePages, ret: returnPages } = groupPagesByDestination(trip.destinations, days);
  const departureLayovers = trip.layovers.filter((l) => l.leg !== "RETURN");
  const returnLayovers = trip.layovers.filter((l) => l.leg === "RETURN");
  const hasDeparture = Boolean(trip.departureCity || trip.arrivalCity || departureLayovers.length);
  const hasReturn = Boolean(trip.returnFromCity || trip.returnToCity || trip.returnDate || returnLayovers.length);

  const layoverRows = (list, leg) => (
    <>
      {list.map((l, i) => (
        <JourneyStop key={l.id} icon="ph-arrows-clockwise" label={"Layover" + (list.length > 1 ? " " + (i + 1) : "")}
          notFound={l.name && l.lat == null}>
          <Field value={l.name} placeholder="City or airport, e.g. LAX" save={updateLayover.bind(null, l.id)}
            style={{ fontSize: 12, minHeight: 30, padding: "3px 6px", flex: 1, minWidth: 0 }} />
          <RemoveLayoverButton layoverId={l.id} />
        </JourneyStop>
      ))}
      <div style={{ paddingLeft: 36 }}>
        <AddButton action={addLayover.bind(null, trip.id, leg)} label="Add layover"
          style={{ border: 0, justifyContent: "flex-start", padding: 4, fontSize: 11 }} />
      </div>
    </>
  );

  const departureRow = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 4 }}>
      <JourneyStop icon="ph-house-line" label="Leaving from">
        <Field value={trip.departureCity} placeholder="Home city (optional)" save={updateDeparture.bind(null, trip.id, "city")}
          style={{ fontSize: 12, minHeight: 30, padding: "3px 6px", flex: 1, minWidth: 0 }} />
        {trip.departureCity && (
          <Field type="date" value={trip.departureDate ? inputDate(trip.departureDate) : ""}
            save={updateDeparture.bind(null, trip.id, "date")}
            style={{ fontSize: 11, minHeight: 30, padding: "3px 6px", width: 124 }} />
        )}
      </JourneyStop>
      {hasDeparture && (
        <>
          {layoverRows(departureLayovers, "DEPARTURE")}
          <JourneyStop icon="ph-airplane-landing" label="Arriving at" notFound={trip.arrivalCity && trip.arrivalLat == null}>
            <Field value={trip.arrivalCity} placeholder="City or airport, e.g. NRT" save={updateArrival.bind(null, trip.id)}
              style={{ fontSize: 12, minHeight: 30, padding: "3px 6px", flex: 1, minWidth: 0 }} />
          </JourneyStop>
        </>
      )}
    </div>
  );

  const returnRow = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 4 }}>
      <JourneyStop icon="ph-airplane-takeoff" label="Return — departing from"
        notFound={trip.returnFromCity && trip.returnFromLat == null}>
        <Field value={trip.returnFromCity} placeholder="City or airport (optional)" save={updateReturn.bind(null, trip.id, "from")}
          style={{ fontSize: 12, minHeight: 30, padding: "3px 6px", flex: 1, minWidth: 0 }} />
        <Field type="date" value={trip.returnDate ? inputDate(trip.returnDate) : ""}
          save={updateReturn.bind(null, trip.id, "date")}
          style={{ fontSize: 11, minHeight: 30, padding: "3px 6px", width: 124 }} />
      </JourneyStop>
      {hasReturn && (
        <>
          {layoverRows(returnLayovers, "RETURN")}
          <JourneyStop icon="ph-house-line" label="Arriving home at" notFound={trip.returnToCity && trip.returnToLat == null}>
            <Field value={trip.returnToCity} placeholder={trip.departureCity || "Home city"} save={updateReturn.bind(null, trip.id, "to")}
              style={{ fontSize: 12, minHeight: 30, padding: "3px 6px", flex: 1, minWidth: 0 }} />
          </JourneyStop>
        </>
      )}
    </div>
  );

  const destinationItems = trip.destinations.map((d, i) => ({
    id: d.id,
    name: d.name,
    dates: fmt(d.arrive) + " – " + fmt(d.depart) + " · " + nights(d.arrive, d.depart),
    // Its "Getting there" — drawn above it, from the previous stop (or from
    // the journey there, for the first destination when there is one).
    connector: i === 0 && !hasDeparture ? null : (
      <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", height: 38 }}>
          <span style={{ width: 1, height: "100%", background: "var(--color-divider)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--color-neutral-400)" }}>
          <i className={"ph " + (TRANSPORT_ICON[d.transport] || "ph-path")} style={{ fontSize: 16, color: "var(--color-accent)" }} />
          <span>{d.transport}{d.detail ? " · " + d.detail : ""}</span>
        </div>
      </div>
    ),
    row: (
      <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 11 }}>
          <span className="dest-dot" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6, minWidth: 0 }}>
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
            <DestinationActions destinationId={d.id} name={d.name} canMakeDeparture={i === 0 && !trip.departureCity} />
          </div>
          {d.lat == null && (
            <span className="text-muted" style={{ fontSize: 10 }}>Not found on the map — try a fuller place name.</span>
          )}
        </div>
      </div>
    )
  }));
  const journalDestinations = [
    {
      id: DEPARTURE_GROUP,
      name: trip.departureCity ? "Leaving " + trip.departureCity : "Leaving from",
      dates: trip.departureDate ? fmt(trip.departureDate) + " · the journey there" : "The journey there",
      connector: null,
      row: departureRow,
      addLabel: "Add a departure page",
      emptyHint: "No departure page yet."
    },
    ...destinationItems
  ];
  if (other.length) {
    journalDestinations.push({
      id: OTHER_GROUP,
      name: "Other pages",
      dates: "Not matched to a destination — set a page's place to one to move it",
      connector: null,
      row: (
        <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, alignItems: "center", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "center" }}><span className="dest-dot dest-dot-muted" /></div>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 15 }}>Other pages</span>
        </div>
      )
    });
  }
  journalDestinations.push({
    id: RETURN_GROUP,
    name: hasReturn && (trip.returnToCity || trip.departureCity)
      ? "Home to " + (trip.returnToCity || trip.departureCity) : "Return",
    dates: trip.returnDate ? fmt(trip.returnDate) + " · the journey home" : "The journey home",
    connector: (
      <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", height: 26 }}>
          <span style={{ width: 1, height: "100%", background: "var(--color-divider)" }} />
        </div>
        <span />
      </div>
    ),
    row: returnRow,
    addLabel: "Add a return page",
    emptyHint: "No return page yet."
  });

  const journalGroups = Object.fromEntries(
    [
      [DEPARTURE_GROUP, departurePages],
      ...groups.entries(),
      ...(other.length ? [[OTHER_GROUP, other]] : []),
      [RETURN_GROUP, returnPages]
    ].map(([destId, list]) => [destId, list.map((p) => p.id)])
  );
  const groupOf = (pageId) => Object.keys(journalGroups).find((k) => journalGroups[k].includes(pageId));
  const initialDestId = groupOf(wantPage) ||
    (journalGroups[wantDest] ? wantDest : initialDestination(trip.destinations, groups)) ||
    (other.length ? OTHER_GROUP : DEPARTURE_GROUP);
  const initialPageId = groupOf(wantPage) ? wantPage : null;

  const journalPages = Object.fromEntries(days.map((p) => [p.id, {
    label: fmt(p.date),
    title: p.title,
    panel: (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Field type="date" value={inputDate(p.date)} save={updatePage.bind(null, p.id, "date")}
            style={{ fontSize: 11, minHeight: 28, padding: "3px 6px", width: 132 }} />
          <Field value={p.place} placeholder="Place" save={updatePage.bind(null, p.id, "place")}
            style={{ fontSize: 11, minHeight: 28, padding: "3px 6px", width: 150 }} />
          <div className="text-muted" style={{ fontSize: 11 }}>
            {[p.weather, p.spend, p.steps].filter(Boolean).join("  ·  ")}
          </div>
          <DeletePageButton pageId={p.id} confirmLabel={p.title ? '"' + p.title + '"' : "this page"} compact
            style={{ marginLeft: "auto" }} />
        </div>
        <Field value={p.title} placeholder="Give this day a title" save={updatePage.bind(null, p.id, "title")}
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
    )
  }]));
  const mapTrips = [{
    id: trip.id, name: trip.name, country: trip.country, coverUrl: trip.coverUrl, coverFrame: coverFrame(trip),
    dateRange: fmtRange(trip.startDate, trip.endDate), href: "/trips/" + trip.id,
    stops: mapStops(await withDepartureCoords(trip))
  }];

  return (
    <>
      <Nav user={user} active="trips" />

      <div style={{ position: "relative", height: 340, overflow: "hidden", background: "var(--color-neutral-900)" }}>
        {trip.coverUrl
          ? <CoverImage tripId={trip.id} url={trip.coverUrl} frame={coverFrame(trip)} canEdit />
          : <div style={{ position: "absolute", inset: 0 }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, var(--color-bg) 2%, color-mix(in srgb, var(--color-bg) 55%, transparent) 45%, transparent)" }} />
        <div style={{ position: "absolute", left: 34, top: 22, display: "flex", gap: 8 }}>
          <Link href="/trips" className="btn btn-secondary" style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
            <i className="ph ph-arrow-left" />All trips
          </Link>
          <CoverUpload tripId={trip.id} hasCover={Boolean(trip.coverUrl)} />
          {isOwner && (
            <DeleteTripButton tripId={trip.id} tripName={trip.name}
              style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }} />
          )}
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
          <VisibilityToggle tripId={trip.id} visibility={trip.visibility} shareUrl={"/u/" + trip.user.handle + "/" + trip.id} />
        </div>
      </div>

      <div style={{ maxWidth: 1420, margin: "0 auto", padding: "18px 34px 0" }}>
        <TripBuddies tripId={trip.id} isOwner={isOwner}
          companions={trip.buddies.map((b) => b.user)} available={availableBuddies} />
      </div>

      <TripJournal
        map={<TripMap trips={mapTrips} height={186} only />}
        destinations={journalDestinations}
        groups={journalGroups}
        pages={journalPages}
        initialDestId={initialDestId}
        initialPageId={initialPageId}
        addPage={addDayPage.bind(null, trip.id)}
        emptyHint="No pages for this destination yet."
        addDestination={
          <AddButton action={addDestination.bind(null, trip.id)} label="Add destination"
            style={{ marginLeft: 36, marginTop: 10, padding: "8px 12px", fontSize: 12, width: "calc(100% - 36px)" }} />
        }
      />
    </>
  );
}

// One row of the journey there (a layover or the arrival) under "Leaving from".
function JourneyStop({ icon, label, notFound, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 23 }}>
        <i className={"ph " + icon} style={{ fontSize: 14, color: "var(--color-neutral-400)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span className="text-muted" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 4 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{children}</div>
        {notFound && <span className="text-muted" style={{ fontSize: 10, paddingLeft: 4 }}>Not found on the map — try the airport code or a fuller name.</span>}
      </div>
    </div>
  );
}
