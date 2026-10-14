import { db } from "./db.js";

// "People you may know": buddies of your buddies who share at least
// MIN_MUTUAL of them with you, most mutual buddies first.
//
// Left out: you, anyone you already have a row with in either direction
// (buddies, pending requests, and blocks — yours or theirs), and unverified
// accounts.
const MIN_MUTUAL = 2;
const LIMIT = 8;

// Returns [{ user, mutual: [{ id, name, handle }] }].
export async function suggestBuddies(meId) {
  const mine = await db.buddy.findMany({
    where: { OR: [{ requesterId: meId }, { addresseeId: meId }] },
    select: { requesterId: true, addresseeId: true, status: true }
  });
  const otherOf = (r) => (r.requesterId === meId ? r.addresseeId : r.requesterId);
  const myBuddies = mine.filter((r) => r.status === "ACCEPTED").map(otherOf);
  if (myBuddies.length < MIN_MUTUAL) return [];
  const known = new Set([meId, ...mine.map(otherOf)]);

  // Every accepted connection one of my buddies has.
  const theirs = await db.buddy.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: { in: myBuddies } }, { addresseeId: { in: myBuddies } }]
    },
    select: { requesterId: true, addresseeId: true }
  });

  // candidate → the set of my buddies they're connected to
  const myBuddySet = new Set(myBuddies);
  const via = new Map();
  for (const r of theirs) {
    for (const [buddy, candidate] of [[r.requesterId, r.addresseeId], [r.addresseeId, r.requesterId]]) {
      if (!myBuddySet.has(buddy) || known.has(candidate)) continue;
      if (!via.has(candidate)) via.set(candidate, new Set());
      via.get(candidate).add(buddy);
    }
  }
  const ranked = [...via.entries()].filter(([, set]) => set.size >= MIN_MUTUAL);
  if (!ranked.length) return [];

  const ids = new Set(ranked.flatMap(([candidate, set]) => [candidate, ...set]));
  const people = new Map((await db.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, handle: true, avatarUrl: true, verified: true }
  })).map((u) => [u.id, u]));

  return ranked
    .filter(([candidate]) => people.get(candidate)?.verified)
    .map(([candidate, set]) => ({
      user: people.get(candidate),
      mutual: [...set].map((id) => people.get(id)).filter(Boolean)
        .sort((a, b) => (a.name || a.handle).localeCompare(b.name || b.handle))
    }))
    .sort((a, b) => b.mutual.length - a.mutual.length ||
      (a.user.name || a.user.handle).localeCompare(b.user.name || b.user.handle))
    .slice(0, LIMIT);
}

// "Jane Doe and Sam Lee", "Jane, Sam and 2 others" — first names where there
// are any, @handles otherwise.
export function mutualLabel(mutual) {
  const nameOf = (u) => (u.name ? u.name.split(/\s+/)[0] : "@" + u.handle);
  const shown = mutual.slice(0, 2).map(nameOf);
  const rest = mutual.length - shown.length;
  const list = rest > 0 ? shown.join(", ") + " and " + rest + (rest === 1 ? " other" : " others") : shown.join(" and ");
  return mutual.length + " mutual " + (mutual.length === 1 ? "buddy" : "buddies") + " · " + list;
}
