"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, currentUser, requireUser, isAdminUser } from "@/lib/session";
import { sendVerificationCode, sendPasswordReset } from "@/lib/mail";
import { saveUpload } from "@/lib/storage";
import { geocode } from "@/lib/geo";
import { snapshotDatabase } from "@/lib/backup";

const code6 = () => String(Math.floor(100000 + Math.random() * 900000));

async function uniqueHandle(email) {
  const base = (email.split("@")[0] || "traveller").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let handle = base, n = 1;
  while (await db.user.findUnique({ where: { handle } })) handle = base + "-" + ++n;
  return handle;
}

async function assertOwner(tripId) {
  const user = await requireUser();
  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.userId !== user.id) throw new Error("FORBIDDEN");
  return trip;
}

async function assertAdmin() {
  const user = await requireUser();
  if (!isAdminUser(user)) throw new Error("FORBIDDEN");
  return user;
}

const MAX_DAY_PAGES = 60; // guards against a mistyped end date generating years of pages

// Which destination's arrive/depart window a given day falls in — used to default
// a single new page (e.g. the manual "Add a page" button) to the right city.
function placeForDate(destinations, date) {
  const hit = destinations.find((d) => d.arrive <= date && date <= d.depart);
  return hit?.name || destinations[destinations.length - 1]?.name || "";
}

// One page per calendar day across a whole itinerary of segments (destinations).
// - Each segment gets a page for every day it spans.
// - A segment whose start and end date match (a day trip) always gets its own
//   page, even when that date is also a neighboring segment's travel day.
// - Otherwise, where two segments' ranges touch (the travel day between them),
//   that day is only ever handed out once — to whichever segment comes first.
function buildDayPages(destinations) {
  const claimed = new Map(); // date (ms) -> place name

  for (const seg of destinations) {
    if (seg.arrive.getTime() === seg.depart.getTime()) claimed.set(seg.arrive.getTime(), seg.name);
  }
  for (const seg of destinations) {
    if (seg.arrive.getTime() === seg.depart.getTime()) continue;
    let t = seg.arrive.getTime();
    const end = seg.depart.getTime();
    for (let n = 0; t <= end && n < MAX_DAY_PAGES; t += 86400000, n++) {
      if (!claimed.has(t)) claimed.set(t, seg.name);
    }
  }

  return [...claimed.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_DAY_PAGES)
    .map(([t, place]) => ({ date: new Date(t), place }));
}

/* ── auth ─────────────────────────────────────────────────────────── */

export async function signUp(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 10) return { error: "Use at least 10 characters." };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.verified) return { error: "That email already has an account." };

  const verifyCode = code6();
  const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, verifyCode, codeExpires } });
  } else {
    await db.user.create({
      data: { email, passwordHash, verifyCode, codeExpires, handle: await uniqueHandle(email) }
    });
  }
  await sendVerificationCode(email, verifyCode);
  redirect("/verify?email=" + encodeURIComponent(email));
}

export async function verifyEmail(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const code = String(form.get("code") || "").trim();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.verifyCode !== code) return { error: "That code does not match." };
  if (user.codeExpires && user.codeExpires < new Date()) return { error: "That code has expired. Resend it." };

  await db.user.update({ where: { id: user.id }, data: { verified: true, verifyCode: null, codeExpires: null } });
  await createSession(user.id);
  redirect("/trips");
}

export async function signIn(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Email or password is wrong." };
  }
  if (!user.verified) redirect("/verify?email=" + encodeURIComponent(email));
  await createSession(user.id);
  redirect("/trips");
}

export async function signOut() {
  await destroySession();
  redirect("/signin");
}

export async function requestPasswordReset(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  // Only verified accounts get a code, but redirect the same way either way
  // so this can't be used to probe which emails have an account.
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.verified) {
    const resetCode = code6();
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000);
    await db.user.update({ where: { id: user.id }, data: { resetCode, resetExpires } });
    await sendPasswordReset(email, resetCode);
  }
  redirect("/reset-password?email=" + encodeURIComponent(email));
}

export async function resetPassword(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const code = String(form.get("code") || "").trim();
  const password = String(form.get("password") || "");
  if (password.length < 10) return { error: "Use at least 10 characters." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.resetCode || user.resetCode !== code) return { error: "That code does not match." };
  if (user.resetExpires && user.resetExpires < new Date()) return { error: "That code has expired. Request a new one." };

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({ where: { id: user.id }, data: { passwordHash, resetCode: null, resetExpires: null } });
  await createSession(user.id);
  redirect("/trips");
}

/* ── profile ──────────────────────────────────────────────────────── */

const PROFILE_FIELDS = [
  "name", "homeCity", "favoritePlace", "bio",
  "facebookUrl", "instagramUrl", "tiktokUrl", "xUrl", "youtubeUrl", "pinterestUrl"
];

export async function updateProfile(field, value) {
  const user = await requireUser();
  if (!PROFILE_FIELDS.includes(field)) throw new Error("BAD_FIELD");
  await db.user.update({ where: { id: user.id }, data: { [field]: String(value) } });
  revalidatePath("/profile");
}

export async function updateHandle(handle) {
  const user = await requireUser();
  const clean = String(handle || "").trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (clean.length < 3) return { error: "Needs at least 3 characters." };
  if (clean.length > 30) return { error: "Keep it under 30 characters." };

  const existing = await db.user.findUnique({ where: { handle: clean } });
  if (existing && existing.id !== user.id) return { error: "That username is taken." };

  await db.user.update({ where: { id: user.id }, data: { handle: clean } });
  revalidatePath("/profile");
  revalidatePath("/trips");
  return { ok: true, handle: clean };
}

export async function setAvatar(_prev, form) {
  const user = await requireUser();
  const file = form.get("avatar");
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return { error: "Choose an image." };
  const url = await saveUpload(file);
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
  revalidatePath("/profile");
  revalidatePath("/trips");
  return { ok: true };
}

/* ── trips ────────────────────────────────────────────────────────── */

export async function createTrip(_prev, form) {
  const user = await requireUser();
  const name = String(form.get("name") || "").trim() || "Untitled trip";
  const startDate = new Date(form.get("start") || Date.now());
  const endDate = new Date(form.get("end") || startDate);
  const visibility = form.get("visibility") === "PUBLIC" ? "PUBLIC" : "PRIVATE";

  const destPlaces = form.getAll("place").map(String).map((s) => s.trim()).filter(Boolean);
  const destArrivals = form.getAll("arrive").map(String);
  const destTransports = form.getAll("transport").map(String);

  // The departure city is optional and becomes destination 0 — the first real
  // destination's own "Getting there" (already collected per-stop) then reads
  // as "how you got there from here", with no separate transport field needed
  // for the departure entry itself.
  const departureCity = String(form.get("departureCity") || "").trim();
  const departureDate = String(form.get("departureDate") || "");

  const places = departureCity ? [departureCity, ...destPlaces] : destPlaces;
  const arrivals = departureCity ? [departureDate, ...destArrivals] : destArrivals;
  const transports = departureCity ? ["", ...destTransports] : destTransports;

  const trip = await db.trip.create({
    data: { userId: user.id, name, startDate, endDate, visibility, country: destPlaces[0] || "" }
  });

  const destinations = [];
  for (let i = 0; i < places.length; i++) {
    const coords = await geocode(places[i]);
    const arrive = new Date(arrivals[i] || startDate);
    const depart = new Date(arrivals[i + 1] || endDate);
    await db.destination.create({
      data: {
        tripId: trip.id, name: places[i], position: i,
        arrive, depart,
        transport: transports[i] || "Flight", detail: "Not booked yet",
        lat: coords?.lat ?? null, lng: coords?.lng ?? null
      }
    });
    destinations.push({ name: places[i], arrive, depart });
  }

  const days = buildDayPages(destinations);
  for (let i = 0; i < days.length; i++) {
    await db.page.create({
      data: { tripId: trip.id, kind: "DAY", position: i, title: "", date: days[i].date, place: days[i].place }
    });
  }

  revalidatePath("/trips");
  redirect("/trips/" + trip.id);
}

export async function setVisibility(tripId, visibility) {
  await assertOwner(tripId);
  await db.trip.update({ where: { id: tripId }, data: { visibility } });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
}

export async function updateTrip(tripId, data) {
  await assertOwner(tripId);
  await db.trip.update({ where: { id: tripId }, data });
  revalidatePath("/trips/" + tripId);
}

export async function renameTrip(tripId, name) {
  const clean = String(name || "").trim() || "Untitled trip";
  await updateTrip(tripId, { name: clean });
}

export async function deleteTrip(tripId) {
  await assertOwner(tripId);
  await db.trip.delete({ where: { id: tripId } });
  revalidatePath("/trips");
  redirect("/trips");
}

/* ── destinations ─────────────────────────────────────────────────── */

export async function addDestination(tripId) {
  const trip = await assertOwner(tripId);
  const count = await db.destination.count({ where: { tripId } });
  await db.destination.create({
    data: {
      tripId, name: "New destination", position: count,
      arrive: trip.startDate, depart: trip.endDate, transport: "Train", detail: "Not booked yet"
    }
  });
  revalidatePath("/trips/" + tripId);
}

export async function updateDestination(id, field, value) {
  const dest = await db.destination.findUnique({ where: { id } });
  if (!dest) throw new Error("NOT_FOUND");
  await assertOwner(dest.tripId);

  const data = {};
  if (field === "name") {
    data.name = String(value);
    const coords = await geocode(data.name); // re-pin when the place changes
    if (coords) { data.lat = coords.lat; data.lng = coords.lng; }
  } else if (field === "arrive" || field === "depart") {
    data[field] = new Date(value);
  } else if (field === "transport" || field === "detail") {
    data[field] = String(value);
  } else {
    throw new Error("BAD_FIELD");
  }
  await db.destination.update({ where: { id }, data });
  revalidatePath("/trips/" + dest.tripId);
  revalidatePath("/trips");
}

export async function deleteDestination(id) {
  const dest = await db.destination.findUnique({ where: { id } });
  if (!dest) return;
  await assertOwner(dest.tripId);
  await db.destination.delete({ where: { id } });
  revalidatePath("/trips/" + dest.tripId);
}

/* ── pages ────────────────────────────────────────────────────────── */

export async function addDayPage(tripId) {
  const trip = await assertOwner(tripId);
  const [lastPage, position, destinations] = await Promise.all([
    db.page.findFirst({ where: { tripId, kind: "DAY" }, orderBy: { date: "desc" } }),
    db.page.count({ where: { tripId, kind: "DAY" } }),
    db.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } })
  ]);

  // Always the day after whatever's currently last, so repeat clicks never land on a date that's taken.
  const date = lastPage ? new Date(lastPage.date.getTime() + 86400000) : new Date(trip.startDate);
  const place = placeForDate(destinations, date) || trip.country || "";

  const page = await db.page.create({
    data: { tripId, kind: "DAY", position, title: "", date, place }
  });
  revalidatePath("/trips/" + tripId);
  return page.id;
}

export async function addActivityPage(tripId, parentId) {
  await assertOwner(tripId);
  const parent = await db.page.findUnique({ where: { id: parentId } });
  const count = await db.page.count({ where: { parentId } });
  const page = await db.page.create({
    data: {
      tripId, kind: "ACTIVITY", parentId, position: count,
      title: "Untitled activity", date: parent?.date || new Date(),
      place: parent?.place || "", time: "12:00"
    }
  });
  revalidatePath("/trips/" + tripId);
  redirect("/trips/" + tripId + "/pages/" + page.id);
}

const PAGE_FIELDS = ["title", "notes", "place", "weather", "spend", "steps", "tags", "time"];

export async function updatePage(id, field, value) {
  const page = await db.page.findUnique({ where: { id } });
  if (!page) throw new Error("NOT_FOUND");
  await assertOwner(page.tripId);

  const data = {};
  if (PAGE_FIELDS.includes(field)) data[field] = String(value);
  else if (field === "date") data.date = new Date(value);
  else if (field === "hidden") data.hidden = Boolean(value);
  else throw new Error("BAD_FIELD");

  await db.page.update({ where: { id }, data });
  revalidatePath("/trips/" + page.tripId);
}

export async function deletePage(id) {
  const page = await db.page.findUnique({ where: { id } });
  if (!page) return;
  await assertOwner(page.tripId);
  await db.page.deleteMany({ where: { parentId: id } });
  await db.page.delete({ where: { id } });
  revalidatePath("/trips/" + page.tripId);
  redirect("/trips/" + page.tripId);
}

/* ── photos ───────────────────────────────────────────────────────── */

export async function uploadPhotos(_prev, form) {
  const pageId = String(form.get("pageId") || "");
  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page) return { error: "That page no longer exists." };
  await assertOwner(page.tripId);

  const files = form.getAll("photos").filter((f) => f && typeof f.arrayBuffer === "function" && f.size > 0);
  if (!files.length) return { error: "Choose at least one photo." };

  let position = await db.photo.count({ where: { pageId } });
  for (const file of files) {
    if (!String(file.type || "").startsWith("image/")) continue;
    const url = await saveUpload(file);
    await db.photo.create({ data: { pageId, url, position: position++ } });
  }
  const trip = await db.trip.findUnique({ where: { id: page.tripId } });
  if (trip && !trip.coverUrl) {
    const first = await db.photo.findFirst({ where: { pageId }, orderBy: { position: "asc" } });
    if (first) await db.trip.update({ where: { id: trip.id }, data: { coverUrl: first.url } });
  }
  revalidatePath("/trips/" + page.tripId);
  return { ok: true };
}

export async function setTripCover(_prev, form) {
  const tripId = String(form.get("tripId") || "");
  await assertOwner(tripId);
  const file = form.get("cover");
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return { error: "Choose an image." };
  const url = await saveUpload(file);
  await db.trip.update({ where: { id: tripId }, data: { coverUrl: url } });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
  return { ok: true };
}

export async function deletePhoto(id) {
  const photo = await db.photo.findUnique({ where: { id }, include: { page: true } });
  if (!photo) return;
  await assertOwner(photo.page.tripId);
  await db.photo.delete({ where: { id } });
  revalidatePath("/trips/" + photo.page.tripId);
}

/* ── admin ────────────────────────────────────────────────────────── */

export async function adminSetVerified(userId, verified) {
  const me = await assertAdmin();
  if (userId === me.id && !verified) return { error: "You can't unverify your own account — that would lock you out." };
  await db.user.update({ where: { id: userId }, data: { verified: Boolean(verified) } });
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminSetAdmin(userId, admin) {
  const me = await assertAdmin();
  if (userId === me.id) return { error: "You can't change your own admin status." };
  await db.user.update({ where: { id: userId }, data: { isAdmin: Boolean(admin) } });
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminDeleteUser(userId) {
  const me = await assertAdmin();
  if (userId === me.id) return { error: "You can't delete your own account here." };
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminCreateBackup() {
  await assertAdmin();
  const file = await snapshotDatabase();
  revalidatePath("/admin/backups");
  return { ok: true, file };
}
