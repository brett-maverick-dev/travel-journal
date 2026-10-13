"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, currentUser, requireUser, isAdminUser } from "@/lib/session";
import { sendVerificationCode, sendPasswordReset } from "@/lib/mail";
import { saveUpload } from "@/lib/storage";
import { geocode, geocodeStop } from "@/lib/geo";
import { snapshotDatabase, deleteBackup } from "@/lib/backup";
import { groupPagesByDestination } from "@/lib/pages";

const code6 = () => String(randomInt(100000, 1000000));

// Wrong guesses allowed against one emailed code before it's thrown away and a
// new one has to be requested — six digits is only 900k possibilities, so
// without this a script could walk the whole space inside the 10-minute window.
const MAX_CODE_ATTEMPTS = 5;

// Parses a yyyy-mm-dd (or any Date-parsable) value; null for blank/garbage so
// callers can refuse it instead of handing Prisma an Invalid Date.
function parseDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function uniqueHandle(email) {
  const base = (email.split("@")[0] || "traveller").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let handle = base, n = 1;
  while (await db.user.findUnique({ where: { handle } })) handle = base + "-" + ++n;
  return handle;
}

// Owner or trip buddy — trip buddies are full collaborators, so this covers
// every content edit (destinations, pages, photos, rename, cover, visibility).
async function assertOwner(tripId) {
  const user = await requireUser();
  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new Error("FORBIDDEN");
  if (trip.userId === user.id) return trip;
  const shared = await db.tripBuddy.findFirst({ where: { tripId, userId: user.id } });
  if (!shared) throw new Error("FORBIDDEN");
  return trip;
}

// Literal owner only — for deleting the trip and managing who has access to
// it, neither of which should be delegable to a collaborator.
async function assertTripOwner(tripId) {
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

// One page per calendar day of each destination's stay, arrival and
// departure days included. A travel day therefore gets a page in both places:
// Tokyo (Nov 2–3) then Kyoto (Nov 3–7) gives Nov 3 a Tokyo page — the morning
// before the train — and a Kyoto page for the arrival. Ordered by date, then
// by itinerary order on a shared day.
function buildDayPages(destinations) {
  const pages = [];
  destinations.forEach((seg, order) => {
    const end = seg.depart.getTime();
    for (let t = seg.arrive.getTime(), n = 0; t <= end && n < MAX_DAY_PAGES; t += 86400000, n++) {
      pages.push({ date: new Date(t), place: seg.name, order });
    }
  });
  return pages
    .sort((a, b) => a.date - b.date || a.order - b.order)
    .slice(0, MAX_DAY_PAGES + destinations.length) // shared travel days are extra
    .map(({ date, place }) => ({ date, place }));
}

/* ── auth ─────────────────────────────────────────────────────────── */

export async function signUp(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== String(form.get("confirmPassword") ?? "")) return { error: "The passwords don't match." };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.verified) return { error: "That email already has an account." };

  const verifyCode = code6();
  const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, verifyCode, codeExpires, verifyAttempts: 0 } });
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
  if (!user || !user.verifyCode) return { error: "That code does not match." };
  if (user.codeExpires && user.codeExpires < new Date()) return { error: "That code has expired. Send a new one below." };
  if (user.verifyCode !== code) {
    const attempts = user.verifyAttempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await db.user.update({ where: { id: user.id }, data: { verifyCode: null, codeExpires: null, verifyAttempts: 0 } });
      return { error: "Too many wrong tries — that code no longer works. Send a new one below." };
    }
    await db.user.update({ where: { id: user.id }, data: { verifyAttempts: attempts } });
    return { error: "That code does not match." };
  }

  await db.user.update({ where: { id: user.id }, data: { verified: true, verifyCode: null, codeExpires: null, verifyAttempts: 0 } });
  await createSession(user.id);
  redirect("/trips");
}

// Issues a fresh code for an account that hasn't been verified yet. Redirects
// the same way whether or not the email exists, like requestPasswordReset.
export async function resendVerification(form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (user && !user.verified) {
    const verifyCode = code6();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await db.user.update({ where: { id: user.id }, data: { verifyCode, codeExpires, verifyAttempts: 0 } });
    await sendVerificationCode(email, verifyCode);
  }
  redirect("/verify?email=" + encodeURIComponent(email) + "&sent=1");
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
    await db.user.update({ where: { id: user.id }, data: { resetCode, resetExpires, resetAttempts: 0 } });
    await sendPasswordReset(email, resetCode);
  }
  redirect("/reset-password?email=" + encodeURIComponent(email));
}

export async function resetPassword(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const code = String(form.get("code") || "").trim();
  const password = String(form.get("password") || "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== String(form.get("confirmPassword") ?? "")) return { error: "The passwords don't match." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.resetCode) return { error: "That code does not match." };
  if (user.resetExpires && user.resetExpires < new Date()) return { error: "That code has expired. Request a new one." };
  if (user.resetCode !== code) {
    const attempts = user.resetAttempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await db.user.update({ where: { id: user.id }, data: { resetCode: null, resetExpires: null, resetAttempts: 0 } });
      return { error: "Too many wrong tries — that code no longer works. Request a new one." };
    }
    await db.user.update({ where: { id: user.id }, data: { resetAttempts: attempts } });
    return { error: "That code does not match." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({ where: { id: user.id }, data: { passwordHash, resetCode: null, resetExpires: null, resetAttempts: 0 } });
  await createSession(user.id);
  redirect("/trips");
}

/* ── profile ──────────────────────────────────────────────────────── */

const PROFILE_FIELDS = [
  "name", "homeCity", "favoritePlace", "bio",
  "facebookUrl", "instagramUrl", "tiktokUrl", "xUrl", "youtubeUrl", "pinterestUrl"
];

// Rendered as clickable links on the public profile, so only http(s) URLs get
// stored — anything else (javascript:, data:, …) is refused.
const URL_FIELDS = ["facebookUrl", "instagramUrl", "tiktokUrl", "xUrl", "youtubeUrl", "pinterestUrl"];

function cleanUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : "https://" + raw;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export async function updateProfile(field, value) {
  const user = await requireUser();
  if (!PROFILE_FIELDS.includes(field)) throw new Error("BAD_FIELD");
  let clean = String(value);
  if (URL_FIELDS.includes(field)) {
    clean = cleanUrl(value);
    if (clean === null) return { error: "Enter a web address starting with https://" };
  }
  await db.user.update({ where: { id: user.id }, data: { [field]: clean } });
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
  if (!String(file.type || "").startsWith("image/")) return { error: "That file isn't an image." };
  const url = await saveUpload(file);
  await db.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
  revalidatePath("/profile");
  revalidatePath("/trips");
  return { ok: true };
}

/* ── trips ────────────────────────────────────────────────────────── */

// A day page for the journey there (DEPARTURE) or home (RETURN), grouped
// under "Leaving from" / "Return" rather than a destination. Dated the
// departure/return date (falling back to the trip's first/last day), or the
// day after the leg's last page when it already has some.
async function createJourneyPage(trip, leg, existing = []) {
  const base = leg === "DEPARTURE" ? (trip.departureDate || trip.startDate) : (trip.returnDate || trip.endDate);
  const last = existing.length ? Math.max(...existing.map((p) => new Date(p.date).getTime())) : null;
  const date = last != null ? new Date(last + 86400000) : new Date(base);
  const place = leg === "DEPARTURE" ? trip.departureCity : trip.returnToCity || trip.departureCity;
  return db.page.create({
    data: { tripId: trip.id, kind: "DAY", leg, position: 0, title: "", date, place: place || "" }
  });
}

// For trips that gain a departure or return after they were created: give
// that leg its page, once.
async function ensureJourneyPage(tripId, leg) {
  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip) return;
  const has = await db.page.count({ where: { tripId, kind: "DAY", leg } });
  if (!has) await createJourneyPage(trip, leg);
}

// When a leg's date changes and it has exactly one page, move that page too.
async function moveJourneyPage(tripId, leg, date) {
  const pages = await db.page.findMany({ where: { tripId, kind: "DAY", leg } });
  if (pages.length === 1) await db.page.update({ where: { id: pages[0].id }, data: { date } });
}

export async function createTrip(_prev, form) {
  const user = await requireUser();
  const name = String(form.get("name") || "").trim() || "Untitled trip";
  const startDate = parseDate(form.get("start")) || new Date(new Date().toISOString().slice(0, 10));
  const endDate = parseDate(form.get("end")) || startDate;
  if (endDate < startDate) return { error: "The trip can't end before it starts." };
  const visibility = form.get("visibility") === "PUBLIC" ? "PUBLIC" : "PRIVATE";

  // One row per destination in the dialog; drop blank rows as a whole so a
  // skipped row can't shift later rows' dates and transport out of line.
  const rawArrivals = form.getAll("arrive").map(String);
  const rawTransports = form.getAll("transport").map(String);
  const stops = form.getAll("place").map((p, i) => ({
    place: String(p).trim(), arrive: rawArrivals[i], transport: rawTransports[i]
  })).filter((r) => r.place);
  const places = stops.map((r) => r.place);
  const arrivals = stops.map((r) => r.arrive);
  const transports = stops.map((r) => r.transport);

  // The departure city is optional and stored on the trip, not as a
  // destination — it gets no day pages. The first destination's own "Getting
  // there" reads as the leg from it.
  const departureCity = String(form.get("departureCity") || "").trim();
  const departureDate = departureCity ? parseDate(form.get("departureDate")) : null;
  const departureCoords = departureCity ? await geocode(departureCity) : null;

  // Stops on the way there (layovers) and where that journey lands — both
  // only for the map's route; neither gets pages.
  const layoverNames = form.getAll("layover").map((v) => String(v).trim()).filter(Boolean);
  const arrivalCity = String(form.get("arrivalCity") || "").trim();
  const arrivalCoords = arrivalCity ? await geocodeStop(arrivalCity) : null;

  // The journey home, mirroring the above. "Arriving home at" left blank
  // means back where the trip started.
  const returnFromCity = String(form.get("returnFromCity") || "").trim();
  const returnDate = parseDate(form.get("returnDate"));
  const returnLayoverNames = form.getAll("returnLayover").map((v) => String(v).trim()).filter(Boolean);
  const typedReturnTo = String(form.get("returnToCity") || "").trim();
  const hasReturn = Boolean(returnFromCity || returnDate || returnLayoverNames.length || typedReturnTo);
  const returnToCity = typedReturnTo || (hasReturn ? departureCity : "");
  const returnFromCoords = returnFromCity ? await geocodeStop(returnFromCity) : null;
  const returnToCoords = !returnToCity ? null
    : returnToCity === departureCity ? departureCoords : await geocode(returnToCity);

  const trip = await db.trip.create({
    data: {
      userId: user.id, name, startDate, endDate, visibility, country: places[0] || "",
      departureCity, departureDate,
      departureLat: departureCoords?.lat ?? null, departureLng: departureCoords?.lng ?? null,
      arrivalCity, arrivalLat: arrivalCoords?.lat ?? null, arrivalLng: arrivalCoords?.lng ?? null,
      returnDate, returnFromCity, returnToCity,
      returnFromLat: returnFromCoords?.lat ?? null, returnFromLng: returnFromCoords?.lng ?? null,
      returnToLat: returnToCoords?.lat ?? null, returnToLng: returnToCoords?.lng ?? null
    }
  });

  const legs = [["DEPARTURE", layoverNames], ["RETURN", returnLayoverNames]];
  for (const [leg, names] of legs) {
    for (let i = 0; i < names.length; i++) {
      const coords = await geocodeStop(names[i]);
      await db.layover.create({
        data: { tripId: trip.id, leg, name: names[i], position: i, lat: coords?.lat ?? null, lng: coords?.lng ?? null }
      });
    }
  }

  // A page each for the journey there and home, alongside the day pages.
  if (departureCity) await createJourneyPage(trip, "DEPARTURE");
  if (hasReturn) await createJourneyPage(trip, "RETURN");

  const destinations = [];
  for (let i = 0; i < places.length; i++) {
    const coords = await geocode(places[i]);
    const arrive = parseDate(arrivals[i]) || startDate;
    const depart = parseDate(arrivals[i + 1]) || endDate;
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
  if (visibility !== "PUBLIC" && visibility !== "PRIVATE") throw new Error("BAD_VISIBILITY");
  await assertOwner(tripId);
  await db.trip.update({ where: { id: tripId }, data: { visibility } });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
}

export async function renameTrip(tripId, name) {
  const clean = String(name || "").trim() || "Untitled trip";
  await assertOwner(tripId);
  await db.trip.update({ where: { id: tripId }, data: { name: clean } });
  revalidatePath("/trips/" + tripId);
}

// Deletes trips and everything under them child-first, in one transaction,
// instead of relying on the database's ON DELETE CASCADE alone — newer MySQL
// releases running with innodb_native_foreign_keys=OFF were seen to leave
// pages behind on multi-level cascades.
function deleteTripsTx(where) {
  const trip = { trip: where };
  return [
    db.photo.deleteMany({ where: { page: trip } }),
    db.page.deleteMany({ where: trip }),
    db.destination.deleteMany({ where: trip }),
    db.layover.deleteMany({ where: trip }),
    db.tripBuddy.deleteMany({ where: trip }),
    db.trip.deleteMany({ where })
  ];
}

export async function deleteTrip(tripId) {
  await assertTripOwner(tripId);
  await db.$transaction(deleteTripsTx({ id: tripId }));
  revalidatePath("/trips");
  redirect("/trips");
}

export async function addTripBuddy(tripId, buddyUserId) {
  const trip = await assertTripOwner(tripId);
  const isBuddy = await db.buddy.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: trip.userId, addresseeId: buddyUserId },
        { requesterId: buddyUserId, addresseeId: trip.userId }
      ]
    }
  });
  if (!isBuddy) return { error: "Add them as a travel buddy first." };

  const existing = await db.tripBuddy.findFirst({ where: { tripId, userId: buddyUserId } });
  if (existing) return { error: "Already added." };

  await db.tripBuddy.create({ data: { tripId, userId: buddyUserId } });
  revalidatePath("/trips/" + tripId);
  return { ok: true };
}

export async function removeTripBuddy(tripId, buddyUserId) {
  await assertTripOwner(tripId);
  await db.tripBuddy.deleteMany({ where: { tripId, userId: buddyUserId } });
  revalidatePath("/trips/" + tripId);
  return { ok: true };
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
    const date = parseDate(value);
    if (!date) return { error: "Pick a date." };
    data[field] = date;
  } else if (field === "transport" || field === "detail") {
    data[field] = String(value);
  } else {
    throw new Error("BAD_FIELD");
  }
  await db.destination.update({ where: { id }, data });
  revalidatePath("/trips/" + dest.tripId);
  revalidatePath("/trips");
}

export async function updateDeparture(tripId, field, value) {
  await assertOwner(tripId);
  let data;
  if (field === "city") {
    const city = String(value || "").trim();
    const coords = city ? await geocode(city) : null; // re-pin the map's starting point
    data = { departureCity: city, departureLat: coords?.lat ?? null, departureLng: coords?.lng ?? null };
  } else if (field === "date") {
    const date = parseDate(value);
    if (!date) return { error: "Pick a date." };
    data = { departureDate: date };
    await moveJourneyPage(tripId, "DEPARTURE", date);
  } else {
    throw new Error("BAD_FIELD");
  }
  await db.trip.update({ where: { id: tripId }, data });
  if (data.departureCity) await ensureJourneyPage(tripId, "DEPARTURE");
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
}

export async function updateArrival(tripId, value) {
  await assertOwner(tripId);
  const city = String(value || "").trim();
  const coords = city ? await geocodeStop(city) : null;
  await db.trip.update({
    where: { id: tripId },
    data: { arrivalCity: city, arrivalLat: coords?.lat ?? null, arrivalLng: coords?.lng ?? null }
  });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
}

// field: "from" (where the journey home leaves — a city or airport),
// "to" (where it lands) or "date".
export async function updateReturn(tripId, field, value) {
  await assertOwner(tripId);
  let data;
  if (field === "from" || field === "to") {
    const city = String(value || "").trim();
    const coords = !city ? null : field === "from" ? await geocodeStop(city) : await geocode(city);
    const key = field === "from" ? "returnFrom" : "returnTo";
    data = { [key + "City"]: city, [key + "Lat"]: coords?.lat ?? null, [key + "Lng"]: coords?.lng ?? null };
  } else if (field === "date") {
    const date = parseDate(value);
    if (!date) return { error: "Pick a date." };
    data = { returnDate: date };
    await moveJourneyPage(tripId, "RETURN", date);
  } else {
    throw new Error("BAD_FIELD");
  }
  await db.trip.update({ where: { id: tripId }, data });
  if (Object.values(data).some((v) => v)) await ensureJourneyPage(tripId, "RETURN");
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
}

export async function addLayover(tripId, leg = "DEPARTURE") {
  if (leg !== "DEPARTURE" && leg !== "RETURN") throw new Error("BAD_LEG");
  await assertOwner(tripId);
  const last = await db.layover.findFirst({ where: { tripId, leg }, orderBy: { position: "desc" } });
  await db.layover.create({ data: { tripId, leg, name: "", position: (last?.position ?? -1) + 1 } });
  revalidatePath("/trips/" + tripId);
}

export async function updateLayover(id, value) {
  const layover = await db.layover.findUnique({ where: { id } });
  if (!layover) throw new Error("NOT_FOUND");
  await assertOwner(layover.tripId);
  const name = String(value || "").trim();
  const coords = name ? await geocodeStop(name) : null;
  await db.layover.update({ where: { id }, data: { name, lat: coords?.lat ?? null, lng: coords?.lng ?? null } });
  revalidatePath("/trips/" + layover.tripId);
  revalidatePath("/trips");
}

export async function deleteLayover(id) {
  const layover = await db.layover.findUnique({ where: { id } });
  if (!layover) return;
  await assertOwner(layover.tripId);
  await db.layover.delete({ where: { id } });
  revalidatePath("/trips/" + layover.tripId);
  revalidatePath("/trips");
}

// Removes a destination along with the day pages that belong only to it and
// are still blank. Pages with anything written in them (text, photos, an
// activity) are kept — they show up wherever their date or place now fits,
// or under "Other pages".
async function removeDestinationAndBlankPages(dest) {
  const [destinations, dayPages] = await Promise.all([
    db.destination.findMany({ where: { tripId: dest.tripId }, orderBy: { position: "asc" } }),
    db.page.findMany({
      where: { tripId: dest.tripId, kind: "DAY" },
      include: { _count: { select: { photos: true } } }
    })
  ]);
  const { groups } = groupPagesByDestination(destinations, dayPages);
  const mine = groups.get(dest.id) || [];
  const withActivities = new Set((await db.page.findMany({
    where: { tripId: dest.tripId, kind: "ACTIVITY", parentId: { in: mine.map((p) => p.id) } },
    select: { parentId: true }
  })).map((a) => a.parentId));
  const blank = mine.filter((p) =>
    !p.title && !p.notes && !p.weather && !p.spend && !p.steps && !p.tags &&
    p._count.photos === 0 && !withActivities.has(p.id));

  await db.$transaction([
    db.page.deleteMany({ where: { id: { in: blank.map((p) => p.id) } } }),
    db.destination.delete({ where: { id: dest.id } })
  ]);
  return { removedPages: blank.length, keptPages: mine.length - blank.length };
}

export async function deleteDestination(id) {
  const dest = await db.destination.findUnique({ where: { id } });
  if (!dest) return;
  await assertOwner(dest.tripId);
  const result = await removeDestinationAndBlankPages(dest);
  revalidatePath("/trips/" + dest.tripId);
  revalidatePath("/trips");
  return { ok: true, ...result };
}

// For trips created before the departure city stopped being a destination:
// turns the first destination back into the trip's departure city.
export async function makeDeparture(id) {
  const dest = await db.destination.findUnique({ where: { id } });
  if (!dest) return;
  await assertOwner(dest.tripId);
  await db.trip.update({
    where: { id: dest.tripId },
    data: { departureCity: dest.name, departureDate: dest.arrive, departureLat: dest.lat, departureLng: dest.lng }
  });
  // Its pages were the days spent leaving home — keep them, as the
  // departure's pages.
  const [destinations, dayPages] = await Promise.all([
    db.destination.findMany({ where: { tripId: dest.tripId }, orderBy: { position: "asc" } }),
    db.page.findMany({ where: { tripId: dest.tripId, kind: "DAY" } })
  ]);
  const mine = groupPagesByDestination(destinations, dayPages).groups.get(dest.id) || [];
  await db.$transaction([
    db.page.updateMany({ where: { id: { in: mine.map((p) => p.id) } }, data: { leg: "DEPARTURE" } }),
    db.destination.delete({ where: { id: dest.id } })
  ]);
  await ensureJourneyPage(dest.tripId, "DEPARTURE");
  revalidatePath("/trips/" + dest.tripId);
  revalidatePath("/trips");
  return { ok: true, movedPages: mine.length };
}

/* ── pages ────────────────────────────────────────────────────────── */

// With a destinationId (the trip page's per-destination "Add a page"), the new
// page goes to the first day of that destination's stay that has no page yet,
// or the day after its last page once every day is taken. Without one, it's
// the day after whatever is currently last in the whole trip.
export async function addDayPage(tripId, destinationId) {
  const trip = await assertOwner(tripId);
  const [dayPages, destinations] = await Promise.all([
    db.page.findMany({ where: { tripId, kind: "DAY" }, orderBy: { date: "asc" } }),
    db.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } })
  ]);
  const position = dayPages.length;

  // The carousel's "Add a page" while Leaving from / Return is selected.
  const leg = destinationId === "departure" ? "DEPARTURE" : destinationId === "return" ? "RETURN" : null;
  if (leg) {
    const page = await createJourneyPage(trip, leg, dayPages.filter((p) => p.leg === leg));
    revalidatePath("/trips/" + tripId);
    return page.id;
  }

  const dest = destinationId ? destinations.find((d) => d.id === destinationId) : null;

  let date, place;
  if (dest) {
    // Only this destination's own pages count as taken — a travel day can
    // have a page in each of the two places (see buildDayPages), so the
    // neighbouring city's page on that date doesn't fill it.
    const own = groupPagesByDestination(destinations, dayPages).groups.get(dest.id) || [];
    const taken = new Set(own.map((p) => p.date.getTime()));
    const end = Math.max(dest.arrive.getTime(), dest.depart.getTime());
    for (let t = dest.arrive.getTime(); t <= end; t += 86400000) {
      if (!taken.has(t)) { date = new Date(t); break; }
    }
    // Every day of the stay has a page: carry on past its last one.
    if (!date) date = new Date(Math.max(...own.map((p) => p.date.getTime()), end) + 86400000);
    place = dest.name;
  } else {
    // Always the day after whatever's currently last, so repeat clicks never land on a date that's taken.
    const lastPage = dayPages[dayPages.length - 1];
    date = lastPage ? new Date(lastPage.date.getTime() + 86400000) : new Date(trip.startDate);
    place = placeForDate(destinations, date) || trip.country || "";
  }

  const page = await db.page.create({
    data: { tripId, kind: "DAY", position, title: "", date, place }
  });
  revalidatePath("/trips/" + tripId);
  return page.id;
}

export async function addActivityPage(tripId, parentId) {
  await assertOwner(tripId);
  const parent = await db.page.findUnique({ where: { id: parentId } });
  if (!parent || parent.tripId !== tripId || parent.kind !== "DAY") throw new Error("NOT_FOUND");
  const count = await db.page.count({ where: { parentId } });
  const page = await db.page.create({
    data: {
      tripId, kind: "ACTIVITY", parentId, position: count,
      title: "Untitled activity", date: parent.date,
      place: parent.place, time: "12:00"
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
  else if (field === "date") {
    data.date = parseDate(value);
    if (!data.date) return { error: "Pick a date." };
  }
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
  if (!String(file.type || "").startsWith("image/")) return { error: "That file isn't an image." };
  const url = await saveUpload(file);
  // A new picture starts from the default framing.
  await db.trip.update({ where: { id: tripId }, data: { coverUrl: url, coverZoom: 1, coverX: 50, coverY: 50 } });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
  return { ok: true };
}

// How the cover sits in its frame — see coverFrame() in lib/format.js.
export async function setCoverFrame(tripId, frame) {
  await assertOwner(tripId);
  const num = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  await db.trip.update({
    where: { id: tripId },
    data: {
      coverZoom: num(frame?.zoom, 1, 3, 1),
      coverX: num(frame?.x, 0, 100, 50),
      coverY: num(frame?.y, 0, 100, 50)
    }
  });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
  return { ok: true };
}

// field: "caption" (the photo's description) or "rotation" (degrees
// clockwise; any value is snapped to the nearest quarter turn, 0–270).
export async function updatePhoto(id, field, value) {
  const photo = await db.photo.findUnique({ where: { id }, include: { page: true } });
  if (!photo) throw new Error("NOT_FOUND");
  await assertOwner(photo.page.tripId);
  let data;
  if (field === "caption") {
    data = { caption: String(value ?? "").trim().slice(0, 2000) };
  } else if (field === "rotation") {
    const quarter = Math.round(Number(value) / 90) || 0;
    data = { rotation: (((quarter % 4) + 4) % 4) * 90 };
  } else {
    throw new Error("BAD_FIELD");
  }
  await db.photo.update({ where: { id }, data });
  revalidatePath("/trips/" + photo.page.tripId);
  revalidatePath("/trips/" + photo.page.tripId + "/pages/" + photo.pageId);
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
  await db.$transaction([
    ...deleteTripsTx({ userId }),
    db.tripBuddy.deleteMany({ where: { userId } }),
    db.buddy.deleteMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    db.user.delete({ where: { id: userId } })
  ]);
  revalidatePath("/admin");
  return { ok: true };
}

export async function adminCreateBackup() {
  await assertAdmin();
  const file = await snapshotDatabase();
  revalidatePath("/admin/backups");
  return { ok: true, file };
}

export async function adminDeleteBackup(name) {
  await assertAdmin();
  if (!(await deleteBackup(String(name || "")))) return { error: "That backup isn't there anymore." };
  revalidatePath("/admin/backups");
  return { ok: true };
}

/* ── travel buddies ───────────────────────────────────────────────── */

// At most one row should exist between any two users — a block or a request
// always supersedes whatever was there before, so callers check this first
// rather than relying on a DB constraint (which side is requester can flip
// when a block gets applied, so a simple unique(requesterId, addresseeId)
// wouldn't catch the reverse-direction duplicate).
async function findBuddyRow(aId, bId) {
  return db.buddy.findFirst({
    where: { OR: [{ requesterId: aId, addresseeId: bId }, { requesterId: bId, addresseeId: aId }] }
  });
}

// Trip collaborators must be travel buddies (see addTripBuddy), so when that
// connection ends, so does each side's access to the other's trips.
async function revokeSharedTrips(aId, bId) {
  await db.tripBuddy.deleteMany({
    where: { OR: [{ userId: aId, trip: { userId: bId } }, { userId: bId, trip: { userId: aId } }] }
  });
}

export async function sendBuddyRequest(targetUserId) {
  const me = await requireUser();
  if (targetUserId === me.id) return { error: "That's you." };
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { error: "User not found." };

  const existing = await findBuddyRow(me.id, targetUserId);
  if (existing) {
    if (existing.status === "BLOCKED") return { error: "You can't send a request here." };
    if (existing.status === "ACCEPTED") return { error: "You're already travel buddies." };
    return { error: "A request is already pending." };
  }
  await db.buddy.create({ data: { requesterId: me.id, addresseeId: targetUserId, status: "PENDING" } });
  revalidatePath("/buddies");
  return { ok: true };
}

export async function acceptBuddyRequest(rowId) {
  const me = await requireUser();
  const row = await db.buddy.findUnique({ where: { id: rowId } });
  if (!row || row.addresseeId !== me.id || row.status !== "PENDING") return { error: "That request isn't there anymore." };
  await db.buddy.update({ where: { id: rowId }, data: { status: "ACCEPTED" } });
  revalidatePath("/buddies");
  return { ok: true };
}

// Declines an incoming request or cancels one you sent — either side of a
// still-pending row can just remove it.
export async function declineBuddyRequest(rowId) {
  const me = await requireUser();
  const row = await db.buddy.findUnique({ where: { id: rowId } });
  if (!row || row.status !== "PENDING" || (row.requesterId !== me.id && row.addresseeId !== me.id)) {
    return { error: "That request isn't there anymore." };
  }
  await db.buddy.delete({ where: { id: rowId } });
  revalidatePath("/buddies");
  return { ok: true };
}

export async function removeBuddy(rowId) {
  const me = await requireUser();
  const row = await db.buddy.findUnique({ where: { id: rowId } });
  if (!row || row.status !== "ACCEPTED" || (row.requesterId !== me.id && row.addresseeId !== me.id)) {
    return { error: "Not found." };
  }
  await db.buddy.delete({ where: { id: rowId } });
  await revokeSharedTrips(row.requesterId, row.addresseeId);
  revalidatePath("/buddies");
  return { ok: true };
}

export async function blockUser(targetUserId) {
  const me = await requireUser();
  if (targetUserId === me.id) return { error: "That's you." };
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { error: "User not found." };

  const existing = await findBuddyRow(me.id, targetUserId);
  if (existing?.status === "BLOCKED" && existing.requesterId !== me.id) {
    // They already blocked you. Leave their block in place — taking the row
    // over would let you unblock it and erase their block entirely.
    await revokeSharedTrips(me.id, targetUserId);
    revalidatePath("/buddies");
    return { ok: true };
  }
  if (existing) {
    await db.buddy.update({
      where: { id: existing.id },
      data: { requesterId: me.id, addresseeId: targetUserId, status: "BLOCKED" }
    });
  } else {
    await db.buddy.create({ data: { requesterId: me.id, addresseeId: targetUserId, status: "BLOCKED" } });
  }
  await revokeSharedTrips(me.id, targetUserId);
  revalidatePath("/buddies");
  return { ok: true };
}

export async function unblockUser(rowId) {
  const me = await requireUser();
  const row = await db.buddy.findUnique({ where: { id: rowId } });
  if (!row || row.status !== "BLOCKED" || row.requesterId !== me.id) return { error: "Not found." };
  await db.buddy.delete({ where: { id: rowId } });
  revalidatePath("/buddies");
  return { ok: true };
}
