// Trip access levels. The trip's creator is its OWNER; everyone else on it
// has the level they were added with (TripBuddy.role). Each level can do
// everything the ones below it can.
//
//   OWNER        everything, including deleting the trip
//   FULL         everything else: delete pages/destinations, make the trip
//                public/private, add and remove people (but not other FULL
//                members, and not grant FULL)
//   EDITOR       add and change anything — pages, text, dates, destinations,
//                the journey there and home, cover, anyone's photos — but
//                delete nothing, and no public/private or people changes
//   CONTRIBUTOR  add photos (and rotate, describe or remove their own) and
//                comment
//   VIEWER       see the trip, including when it's private, and comment

export const ROLES = ["VIEWER", "CONTRIBUTOR", "EDITOR", "FULL", "OWNER"];
export const SHAREABLE_ROLES = ["FULL", "EDITOR", "CONTRIBUTOR", "VIEWER"]; // what a buddy can be added as

export const ROLE_LABEL = {
  OWNER: "Owner", FULL: "Full access", EDITOR: "Editor", CONTRIBUTOR: "Contributor", VIEWER: "Viewer"
};
export const ROLE_HINT = {
  FULL: "Everything except deleting the trip",
  EDITOR: "Add and change anything, but can't delete",
  CONTRIBUTOR: "Add photos and comment",
  VIEWER: "Read and comment"
};

// The lowest level that may do each thing.
const NEEDS = {
  view: "VIEWER",
  comment: "VIEWER",
  upload: "CONTRIBUTOR",
  edit: "EDITOR",          // pages, text, dates, destinations, journey, cover, anyone's photos
  delete: "FULL",          // pages, destinations, anyone's comments
  visibility: "FULL",
  managePeople: "FULL",
  deleteTrip: "OWNER"
};

const rank = (role) => ROLES.indexOf(role);

export function normalizeRole(role) {
  return SHAREABLE_ROLES.includes(role) ? role : "EDITOR";
}

export function can(role, ability) {
  if (!role || !NEEDS[ability]) return false;
  return rank(role) >= rank(NEEDS[ability]);
}

// Everything a page needs to decide what to show, in one object.
export function abilities(role) {
  return Object.fromEntries(Object.keys(NEEDS).map((a) => [a, can(role, a)]));
}

// Whether `role` may add/remove someone at `targetRole`, or set someone to
// it: the owner manages anyone; FULL manages everyone below FULL.
export function canManageRole(role, targetRole) {
  if (role === "OWNER") return true;
  return role === "FULL" && targetRole !== "FULL" && targetRole !== "OWNER";
}

// A user's level on a trip (null if they're not on it). `trip` needs userId,
// and either `buddies` loaded (with role) or a db to look the row up in.
export async function tripRole(trip, userId, db) {
  if (!trip || !userId) return null;
  if (trip.userId === userId) return "OWNER";
  const row = trip.buddies
    ? trip.buddies.find((b) => b.userId === userId)
    : await db.tripBuddy.findFirst({ where: { tripId: trip.id, userId } });
  return row ? normalizeRole(row.role) : null;
}
