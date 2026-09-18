"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, currentUser, requireUser } from "@/lib/session";
import { sendVerificationCode } from "@/lib/mail";
import { saveUpload } from "@/lib/storage";
import { geocode } from "@/lib/geo";

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

/* ── trips ────────────────────────────────────────────────────────── */

export async function createTrip(_prev, form) {
  const user = await requireUser();
  const name = String(form.get("name") || "").trim() || "Untitled trip";
  const startDate = new Date(form.get("start") || Date.now());
  const endDate = new Date(form.get("end") || startDate);
  const visibility = form.get("visibility") === "PUBLIC" ? "PUBLIC" : "PRIVATE";

  const places = form.getAll("place").map(String).map((s) => s.trim()).filter(Boolean);
  const arrivals = form.getAll("arrive").map(String);
  const transports = form.getAll("transport").map(String);

  const trip = await db.trip.create({
    data: { userId: user.id, name, startDate, endDate, visibility, country: places[0] || "" }
  });

  for (let i = 0; i < places.length; i++) {
    const coords = await geocode(places[i]);
    const arrive = new Date(arrivals[i] || startDate);
    await db.destination.create({
      data: {
        tripId: trip.id, name: places[i], position: i,
        arrive, depart: new Date(arrivals[i + 1] || endDate),
        transport: transports[i] || "Flight", detail: "Not booked yet",
        lat: coords?.lat ?? null, lng: coords?.lng ?? null
      }
    });
  }

  await db.page.create({
    data: { tripId: trip.id, kind: "DAY", title: "Day one", date: startDate, place: places[0] || "", position: 0 }
  });

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
  const count = await db.page.count({ where: { tripId, kind: "DAY" } });
  const last = await db.destination.findFirst({ where: { tripId }, orderBy: { position: "desc" } });
  const page = await db.page.create({
    data: {
      tripId, kind: "DAY", position: count, title: "Untitled page",
      date: new Date(trip.startDate.getTime() + count * 86400000), place: last?.name || ""
    }
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
