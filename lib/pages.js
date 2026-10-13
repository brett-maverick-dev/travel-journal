// Groups a trip's day pages under the destination each one belongs to, for the
// per-destination page carousel.
//
// A day page records the place it was generated for (createTrip and
// addDayPage set it to the destination's name), so a name match wins. Pages
// whose place doesn't name a destination — the destination was renamed, or
// the place was edited to something more specific — fall back to the
// destination whose arrive–depart window holds the page's date. Anything left
// over is returned separately so it can still be shown, never silently dropped.

export const OTHER_GROUP = "other";

const norm = (s) => String(s || "").trim().toLowerCase();

export function groupPagesByDestination(destinations, dayPages) {
  const groups = new Map(destinations.map((d) => [d.id, []]));
  const byName = new Map();
  for (const d of destinations) if (!byName.has(norm(d.name))) byName.set(norm(d.name), d.id);

  const other = [];
  for (const page of dayPages) {
    const t = new Date(page.date).getTime();
    const destId = byName.get(norm(page.place)) ||
      destinations.find((d) => new Date(d.arrive).getTime() <= t && t <= new Date(d.depart).getTime())?.id;
    if (destId) groups.get(destId).push(page);
    else other.push(page);
  }

  const byDate = (a, b) => new Date(a.date) - new Date(b.date) || a.position - b.position;
  for (const list of groups.values()) list.sort(byDate);
  other.sort(byDate);
  return { groups, other };
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
