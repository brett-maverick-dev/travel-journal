import { fmt, nights, tagList, TRANSPORT_ICON } from "@/lib/format";
import { groupPagesByDestination, initialDestination, OTHER_GROUP, DEPARTURE_GROUP, RETURN_GROUP } from "@/lib/pages";

// The read-only journal for a trip — the public trip page, and trip members
// who can't edit (Viewers and Contributors). Returns the props TripJournal
// takes. What goes under each page is up to the caller:
//
//   photosFor(page)    → node or null (e.g. a read-only grid, or one that
//                        lets a Contributor add photos)
//   commentsFor(page)  → node, or leave it out for no comments
//
// `trip.pages` should already be filtered to what this viewer may see.
export function readOnlyJournal(trip, { wantDest, wantPage, photosFor, commentsFor }) {
  const days = trip.pages.filter((p) => p.kind === "DAY");
  const { groups, other, departure: departurePages, ret: returnPages } = groupPagesByDestination(trip.destinations, days);
  const via = (leg) => trip.layovers.filter((l) => (l.leg || "DEPARTURE") === leg && l.name).map((l) => l.name).join(", ");
  const hasDeparture = Boolean(trip.departureCity || trip.arrivalCity || departurePages.length);
  const hasReturn = Boolean(trip.returnFromCity || trip.returnToCity || trip.returnDate || returnPages.length);

  // Read-only summary of a journey there or home, as a list item's row.
  const journeyRow = (icon, title, lines) => (
    <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, paddingTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 3 }}>
        <i className={"ph " + icon} style={{ fontSize: 14, color: "var(--color-neutral-400)" }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 16 }}>{title}</div>
        {lines.filter(Boolean).map((line, i) => (
          <div key={i} className="text-muted" style={{ fontSize: 12 }}>{line}</div>
        ))}
      </div>
    </div>
  );

  const destinationItems = trip.destinations.map((d, i) => ({
    id: d.id,
    name: d.name,
    dates: fmt(d.arrive) + " – " + fmt(d.depart) + " · " + nights(d.arrive, d.depart),
    connector: i === 0 && !hasDeparture ? null : (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--color-neutral-400)", padding: "4px 0 6px 36px" }}>
        <i className={"ph " + (TRANSPORT_ICON[d.transport] || "ph-path")} style={{ fontSize: 15, color: "var(--color-accent)" }} />
        <span>{d.transport}{d.detail ? " · " + d.detail : ""}</span>
      </div>
    ),
    row: (
      <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, paddingTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 5 }}><span className="dest-dot" /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 16 }}>{d.name}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>{fmt(d.arrive)} – {fmt(d.depart)} · {nights(d.arrive, d.depart)}</div>
        </div>
      </div>
    )
  }));
  const departureTitle = trip.departureCity ? "Leaving " + trip.departureCity : "The journey there";
  const journalDestinations = [
    ...(hasDeparture ? [{
      id: DEPARTURE_GROUP,
      name: departureTitle,
      dates: trip.departureDate ? fmt(trip.departureDate) + " · the journey there" : "The journey there",
      connector: null,
      row: journeyRow("ph-house-line", departureTitle, [
        trip.departureDate && fmt(trip.departureDate),
        via("DEPARTURE") && "via " + via("DEPARTURE"),
        trip.arrivalCity && "arriving at " + trip.arrivalCity
      ])
    }] : []),
    ...destinationItems
  ];
  if (other.length) {
    journalDestinations.push({
      id: OTHER_GROUP, name: "More pages", dates: "", connector: null,
      row: (
        <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 12, paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 5 }}><span className="dest-dot dest-dot-muted" /></div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 16 }}>More pages</div>
        </div>
      )
    });
  }
  const homeTo = trip.returnToCity || trip.departureCity;
  const returnTitle = homeTo ? "Home to " + homeTo : "The journey home";
  if (hasReturn) {
    journalDestinations.push({
      id: RETURN_GROUP,
      name: returnTitle,
      dates: trip.returnDate ? fmt(trip.returnDate) + " · the journey home" : "The journey home",
      connector: null,
      row: journeyRow("ph-airplane-takeoff", returnTitle, [
        trip.returnDate && fmt(trip.returnDate),
        trip.returnFromCity && "from " + trip.returnFromCity,
        via("RETURN") && "via " + via("RETURN")
      ])
    });
  }
  const journalGroups = Object.fromEntries(
    [
      ...(hasDeparture ? [[DEPARTURE_GROUP, departurePages]] : []),
      ...groups.entries(),
      ...(other.length ? [[OTHER_GROUP, other]] : []),
      ...(hasReturn ? [[RETURN_GROUP, returnPages]] : [])
    ].map(([destId, list]) => [destId, list.map((p) => p.id)])
  );
  const groupOf = (pageId) => Object.keys(journalGroups).find((k) => journalGroups[k].includes(pageId));
  const initialDestId = groupOf(wantPage) ||
    (journalGroups[wantDest] ? wantDest : initialDestination(trip.destinations, groups)) ||
    (other.length ? OTHER_GROUP : null);

  const journalPages = Object.fromEntries(days.map((p) => {
    const acts = trip.pages.filter((x) => x.kind === "ACTIVITY" && x.parentId === p.id);
    return [p.id, {
      label: fmt(p.date),
      title: p.title,
      panel: (
        <article>
          <div className="card-kicker">{fmt(p.date)}{p.place ? " · " + p.place : ""}</div>
          <h2 style={{ margin: "6px 0 12px" }}>{p.title}</h2>
          {p.notes.split("\n").filter(Boolean).map((para, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 1.65, maxWidth: "68ch" }}>{para}</p>
          ))}
          {photosFor(p) && <div style={{ marginTop: 8 }}>{photosFor(p)}</div>}
          {tagList(p.tags).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {tagList(p.tags).map((t) => <span className="tag tag-outline" key={t}>{t}</span>)}
            </div>
          )}
          {acts.map((a) => (
            <section key={a.id} className="card elev-sm" style={{ padding: 20, marginTop: 20, gap: 10 }}>
              <div className="card-kicker">{[a.time, a.place].filter(Boolean).join(" · ")}</div>
              <h3 style={{ margin: 0 }}>{a.title}</h3>
              {photosFor(a)}
              {a.notes.split("\n").filter(Boolean).map((para, i) => (
                <p key={i} style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>{para}</p>
              ))}
              {commentsFor && commentsFor(a)}
            </section>
          ))}
          {commentsFor && <div style={{ marginTop: 28 }}>{commentsFor(p)}</div>}
        </article>
      )
    }];
  }));
  return {
    destinations: journalDestinations, groups: journalGroups, pages: journalPages,
    initialDestId, initialPageId: groupOf(wantPage) ? wantPage : null
  };
}
