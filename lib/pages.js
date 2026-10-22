// Groups a trip's day pages under the destination each one belongs to, for the
// per-destination page carousel.
//
// A day page records the place it was generated for (createTrip and
// addDayPage set it to the destination's name), so a name match wins. Pages
// whose place doesn't name a destination — the destination was renamed, or
// the place was edited to something more specific — fall back to the
// destination whose arrive–depart window holds the page's date. Anything left
// over is returned separately so it can still be shown, never silently dropped.
// Pages for the journey there or home (leg DEPARTURE / RETURN) skip all that
// and come back as `departure` / `ret`.
//
// Subpages — day pages whose parentId is another day page, made by dragging a
// page's tab below another's — skip the matching too: they follow their main
// page, in their own order (position). One whose main page isn't in
// `dayPages` (hidden from this viewer, or deleted) is treated as a main page.

export const OTHER_GROUP = "other";
// The journey there and home: groups for day pages whose `leg` is set.
export const DEPARTURE_GROUP = "departure";
export const RETURN_GROUP = "return";

const norm = (s) => String(s || "").trim().toLowerCase();

export function groupPagesByDestination(destinations, dayPages) {
  const groups = new Map(destinations.map((d) => [d.id, []]));
  const byName = new Map();
  for (const d of destinations) if (!byName.has(norm(d.name))) byName.set(norm(d.name), d.id);

  const byId = new Map(dayPages.map((p) => [p.id, p]));
  // Only one level deep: a parent that is itself a subpage can't hold one
  // (movePage never makes that), and anything that did would vanish here.
  const isSub = (p) => Boolean(p.parentId && byId.has(p.parentId) && !byId.get(p.parentId).parentId);
  const subsOf = new Map();
  const main = [];
  for (const page of dayPages) {
    if (isSub(page)) {
      if (!subsOf.has(page.parentId)) subsOf.set(page.parentId, []);
      subsOf.get(page.parentId).push(page);
    } else main.push(page);
  }

  const other = [], departure = [], ret = [];
  for (const page of main) {
    if (page.leg === "DEPARTURE") { departure.push(page); continue; }
    if (page.leg === "RETURN") { ret.push(page); continue; }
    const t = new Date(page.date).getTime();
    const destId = byName.get(norm(page.place)) ||
      destinations.find((d) => new Date(d.arrive).getTime() <= t && t <= new Date(d.depart).getTime())?.id;
    if (destId) groups.get(destId).push(page);
    else other.push(page);
  }

  const byDate = (a, b) => new Date(a.date) - new Date(b.date) || a.position - b.position;
  const byPosition = (a, b) => a.position - b.position || new Date(a.date) - new Date(b.date);
  const withSubs = (list) => list.sort(byDate).flatMap((p) => [p, ...(subsOf.get(p.id) || []).sort(byPosition)]);
  for (const [id, list] of groups) groups.set(id, withSubs(list));
  return { groups, other: withSubs(other), departure: withSubs(departure), ret: withSubs(ret) };
}

// Which destination to open first: wherever the trip is today (a live
// journal), otherwise the first one that has any pages.
export function initialDestination(destinations, groups) {
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const current = destinations.find((d) =>
    new Date(d.arrive).getTime() <= today && today <= new Date(d.depart).getTime() &&
    groups.get(d.id)?.length);
  return current?.id || destinations.find((d) => groups.get(d.id)?.length)?.id || destinations[0]?.id || null;
}
