"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, currentUser, requireUser, isAdminUser } from "@/lib/session";
import {
  sendVerificationCode, sendPasswordReset, sendBuddyRequestEmail,
  sendEmailChangeCode, sendEmailChangeRequested, sendEmailChanged
} from "@/lib/mail";
import { signBuddyToken, verifyBuddyToken } from "@/lib/buddy-token";
import { signEmailUndoToken, verifyEmailUndoToken } from "@/lib/email-undo-token";
import { appUrl } from "@/lib/app-url";
import { can, tripRole, canManageRole, normalizeRole, SHAREABLE_ROLES } from "@/lib/permissions";
import { saveUpload, mediaUrl, UPLOAD_DIR } from "@/lib/storage";
import { storeConfigured, presignPut, objectInfo, deleteObject } from "@/lib/object-store";
import { mediaUploadToken } from "@/lib/media-token";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, videoExtension } from "@/lib/media";
import { stat, unlink } from "node:fs/promises";
import { geocode, geocodeStop } from "@/lib/geo";
import { snapshotDatabase, deleteBackup } from "@/lib/backup";
import { groupPagesByDestination } from "@/lib/pages";

const code6 = () => String(randomInt(100000, 1000000));

// Wrong guesses allowed against one emailed code before it's thrown away and a
// new one has to be requested — six digits is only 900k possibilities, so
// without this a script could walk the whole space inside the 10-minute window.
const MAX_CODE_ATTEMPTS = 5;

// Wrong passwords allowed in a row — signing in, or confirming it on the
// profile — before the account takes none for a while. Resetting the password
// lifts the lock, so its owner can't be shut out by someone else's guessing.
const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_LOCK_MS = 15 * 60 * 1000;

function passwordLockMessage(until) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
  return "Too many wrong passwords. Try again in " + minutes + (minutes === 1 ? " minute" : " minutes") +
    ", or reset your password.";
}

// null when the password is right; otherwise { locked: message } if the
// account isn't taking passwords right now, or {} for a plain wrong one.
async function checkPassword(user, password) {
  if (user.passwordLockedUntil > new Date()) return { locked: passwordLockMessage(user.passwordLockedUntil) };
  if (await bcrypt.compare(password, user.passwordHash)) {
    if (user.failedPasswordAttempts) await db.user.update({ where: { id: user.id }, data: { failedPasswordAttempts: 0 } });
    return null;
  }
  const { failedPasswordAttempts } = await db.user.update({
    where: { id: user.id }, data: { failedPasswordAttempts: { increment: 1 } }, select: { failedPasswordAttempts: true }
  });
  if (failedPasswordAttempts < MAX_PASSWORD_ATTEMPTS) return {};
  const until = new Date(Date.now() + PASSWORD_LOCK_MS);
  await db.user.update({ where: { id: user.id }, data: { failedPasswordAttempts: 0, passwordLockedUntil: until } });
  return { locked: passwordLockMessage(until) };
}

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

// The signed-in user's level on a trip, refused unless it allows `ability`
// (see lib/permissions.js for what each level may do).
async function assertCan(tripId, ability) {
  const user = await requireUser();
  const trip = await db.trip.findUnique({ where: { id: String(tripId || "") } });
  const role = await tripRole(trip, user.id, db);
  if (!can(role, ability)) throw new Error("FORBIDDEN");
  return { trip, user, role };
}

// Photos: anyone who can edit may change any of them; a Contributor only
// their own (photos from before uploaders were recorded count as the owner's).
function canManagePhoto(role, photo, user, trip) {
  if (can(role, "edit")) return true;
  const uploader = photo.uploadedById ?? trip.userId;
  return can(role, "upload") && uploader === user.id;
}

async function assertPhotoAccess(photo) {
  const { trip, user, role } = await assertCan(photo.page.tripId, "upload");
  if (!canManagePhoto(role, photo, user, trip)) throw new Error("FORBIDDEN");
  return { trip, user, role };
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
  if (!user) return { error: "Email or password is wrong." };
  const wrong = await checkPassword(user, password);
  if (wrong) return { error: wrong.locked || "Email or password is wrong." };
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

  // Bumping sessionVersion signs out every other device — if someone else had
  // got in, the reset locks them out. A pending email change is dropped too,
  // since it may have been theirs.
  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash, resetCode: null, resetExpires: null, resetAttempts: 0, sessionVersion: { increment: 1 },
      failedPasswordAttempts: 0, passwordLockedUntil: null, ...NO_EMAIL_CHANGE
    }
  });
  await createSession(user.id);
  redirect("/trips");
}

/* ── email change ─────────────────────────────────────────────────── */

// Changing the address takes the account password (a signed-in session alone
// isn't enough) and a code sent to the new inbox. The old inbox hears about
// the request and the change, and the change signs out every other device.
// The notice of the change carries a link that undoes it (undoEmailChange).

const EMAIL_CODE_TTL = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_WAIT = 60 * 1000;

const NO_EMAIL_CHANGE = { pendingEmail: null, emailChangeCode: null, emailChangeExpires: null, emailChangeAttempts: 0 };

// "n•••@gmail.com" — enough for the owner to recognise the address in a
// notice sent to the old inbox without spelling it out.
function maskEmail(email) {
  const [local, domain] = email.split("@");
  return local[0] + "•••@" + domain;
}

// Sends a fresh code to `pendingEmail`, at most once a minute so the form
// can't be used to flood someone's inbox. Returns an error object, or null.
async function issueEmailChangeCode(user, pendingEmail) {
  const sentAt = user.emailChangeExpires ? user.emailChangeExpires.getTime() - EMAIL_CODE_TTL : 0;
  if (Date.now() - sentAt < EMAIL_CODE_RESEND_WAIT) {
    return { error: "We just sent a code — wait a minute before asking for another." };
  }
  const emailChangeCode = code6();
  await db.user.update({
    where: { id: user.id },
    data: { pendingEmail, emailChangeCode, emailChangeExpires: new Date(Date.now() + EMAIL_CODE_TTL), emailChangeAttempts: 0 }
  });
  await sendEmailChangeCode(pendingEmail, emailChangeCode);
  return null;
}

export async function requestEmailChange(_prev, form) {
  const user = await requireUser();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 191) return { error: "Enter a valid email address." };
  if (email === user.email) return { error: "That's already your email address." };
  const wrong = await checkPassword(user, password);
  if (wrong) return { error: wrong.locked || "That password isn't right." };

  // Sign-up already says when an address is taken, so saying it here gives nothing away.
  const owner = await db.user.findUnique({ where: { email } });
  if (owner?.verified) return { error: "That email already belongs to another account." };

  const res = await issueEmailChangeCode(user, email);
  if (res) return res;
  await sendEmailChangeRequested(user.email, maskEmail(email), (await appUrl()) + "/forgot-password");
  redirect("/profile/email");
}

export async function resendEmailChange() {
  const user = await requireUser();
  if (!user.pendingEmail) redirect("/profile/email");
  const res = await issueEmailChangeCode(user, user.pendingEmail);
  redirect("/profile/email?" + (res ? "wait=1" : "sent=1"));
}

export async function cancelEmailChange() {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: NO_EMAIL_CHANGE });
  redirect("/profile");
}

export async function confirmEmailChange(_prev, form) {
  const user = await requireUser();
  const code = String(form.get("code") || "").trim();
  if (!user.pendingEmail || !user.emailChangeCode) return { error: "That code does not match. Send a new one below." };
  if (user.emailChangeExpires < new Date()) return { error: "That code has expired. Send a new one below." };
  if (user.emailChangeCode !== code) {
    const attempts = user.emailChangeAttempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      // Keep emailChangeExpires so the resend wait still applies.
      await db.user.update({ where: { id: user.id }, data: { emailChangeCode: null, emailChangeAttempts: 0 } });
      return { error: "Too many wrong tries — that code no longer works. Send a new one below." };
    }
    await db.user.update({ where: { id: user.id }, data: { emailChangeAttempts: attempts } });
    return { error: "That code does not match." };
  }

  const oldEmail = user.email;
  const email = user.pendingEmail;
  try {
    await db.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { email } });
      if (owner?.verified) throw new Error("EMAIL_TAKEN");
      // An unverified sign-up holding the address never proved it owns the
      // inbox; this user just did. Unverified accounts can't have made anything.
      if (owner) await tx.user.delete({ where: { id: owner.id } });
      await tx.user.update({
        where: { id: user.id },
        data: { email, ...NO_EMAIL_CHANGE, sessionVersion: { increment: 1 } }
      });
    });
  } catch (err) {
    if (err.message !== "EMAIL_TAKEN" && err.code !== "P2002") throw err;
    await db.user.update({ where: { id: user.id }, data: NO_EMAIL_CHANGE });
    return { error: "That email now belongs to another account, so it can't be moved to yours." };
  }

  const undoToken = await signEmailUndoToken(user.id, oldEmail);
  await sendEmailChanged(oldEmail, maskEmail(email), (await appUrl()) + "/restore-email?t=" + encodeURIComponent(undoToken));
  await createSession(user.id); // keeps this device signed in under the new sessionVersion
  redirect("/profile?email=changed");
}

// From the undo link sent to the old address (see app/restore-email). Moves
// the account back there and treats it as taken over: everyone is signed out,
// the password — which whoever changed the email knows — stops working, and a
// reset code goes to the restored address so the owner can set a new one.
export async function undoEmailChange(form) {
  const token = String(form.get("t") || "");
  const back = "/restore-email?t=" + encodeURIComponent(token);
  const claim = await verifyEmailUndoToken(token);
  if (!claim) redirect(back);
  const user = await db.user.findUnique({ where: { id: claim.userId } });
  if (!user || user.email === claim.email) redirect(back);

  const resetCode = code6();
  const unusable = await bcrypt.hash(randomUUID() + randomUUID(), 10);
  try {
    await db.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { email: claim.email } });
      if (owner?.verified) throw new Error("EMAIL_TAKEN");
      if (owner) await tx.user.delete({ where: { id: owner.id } }); // an unverified sign-up, as in confirmEmailChange
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: claim.email, ...NO_EMAIL_CHANGE, sessionVersion: { increment: 1 },
          passwordHash: unusable, failedPasswordAttempts: 0, passwordLockedUntil: null,
          resetCode, resetExpires: new Date(Date.now() + 10 * 60 * 1000), resetAttempts: 0
        }
      });
    });
  } catch (err) {
    if (err.message !== "EMAIL_TAKEN" && err.code !== "P2002") throw err;
    redirect(back + "&taken=1");
  }

  await sendPasswordReset(claim.email, resetCode);
  await destroySession();
  redirect("/reset-password?restored=1&email=" + encodeURIComponent(claim.email));
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
  await assertCan(tripId, "visibility");
  await db.trip.update({ where: { id: tripId }, data: { visibility } });
  revalidatePath("/trips/" + tripId);
  revalidatePath("/trips");
}

export async function renameTrip(tripId, name) {
  const clean = String(name || "").trim() || "Untitled trip";
  await assertCan(tripId, "edit");
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
    db.comment.deleteMany({ where: { page: trip } }),
    db.photo.deleteMany({ where: { page: trip } }),
    db.page.deleteMany({ where: trip }),
    db.destination.deleteMany({ where: trip }),
    db.layover.deleteMany({ where: trip }),
    db.tripBuddy.deleteMany({ where: trip }),
    db.trip.deleteMany({ where })
  ];
}

export async function deleteTrip(tripId) {
  await assertCan(tripId, "deleteTrip");
  await db.$transaction(deleteTripsTx({ id: tripId }));
  revalidatePath("/trips");
  redirect("/trips");
}

// Adding someone to a trip, at a level. You must be travel buddies with
// them yourself, and may only hand out levels you're allowed to manage (the
// owner any; Full access anything below Full access).
export async function addTripBuddy(tripId, buddyUserId, role = "EDITOR") {
  const { trip, user, role: myRole } = await assertCan(tripId, "managePeople");
  const level = normalizeRole(role);
  if (!canManageRole(myRole, level)) return { error: "Only the owner can give Full access." };
  if (buddyUserId === trip.userId) return { error: "That's the trip's owner." };
  const isBuddy = await db.buddy.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: user.id, addresseeId: buddyUserId },
        { requesterId: buddyUserId, addresseeId: user.id }
      ]
    }
  });
  if (!isBuddy) return { error: "Add them as a travel buddy first." };

  const existing = await db.tripBuddy.findFirst({ where: { tripId, userId: buddyUserId } });
  if (existing) return { error: "Already added." };

  await db.tripBuddy.create({ data: { tripId, userId: buddyUserId, role: level } });
  revalidatePath("/trips/" + tripId);
  return { ok: true };
}

export async function setTripBuddyRole(tripId, buddyUserId, role) {
  const { role: myRole } = await assertCan(tripId, "managePeople");
  if (!SHAREABLE_ROLES.includes(role)) throw new Error("BAD_ROLE");
  const row = await db.tripBuddy.findFirst({ where: { tripId, userId: buddyUserId } });
  if (!row) return { error: "They're not on this trip anymore." };
  if (!canManageRole(myRole, normalizeRole(row.role)) || !canManageRole(myRole, role)) {
    return { error: "Only the owner can change Full access." };
  }
  await db.tripBuddy.update({ where: { id: row.id }, data: { role } });
  revalidatePath("/trips/" + tripId);
  return { ok: true };
}

// Removes someone from a trip — or, with your own id, leaves it (anyone can).
export async function removeTripBuddy(tripId, buddyUserId) {
  const user = await requireUser();
  const row = await db.tripBuddy.findFirst({ where: { tripId, userId: buddyUserId } });
  if (buddyUserId === user.id) {
    if (row) await db.tripBuddy.delete({ where: { id: row.id } });
    revalidatePath("/trips");
    redirect("/trips");
  }
  const { role: myRole } = await assertCan(tripId, "managePeople");
  if (!row) return { ok: true };
  if (!canManageRole(myRole, normalizeRole(row.role))) return { error: "Only the owner can remove Full access." };
  await db.tripBuddy.delete({ where: { id: row.id } });
  revalidatePath("/trips/" + tripId);
  return { ok: true };
}

/* ── destinations ─────────────────────────────────────────────────── */

export async function addDestination(tripId) {
  const { trip } = await assertCan(tripId, "edit");
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
  await assertCan(dest.tripId, "edit");

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
  await assertCan(tripId, "edit");
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
  await assertCan(tripId, "edit");
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
  await assertCan(tripId, "edit");
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
  await assertCan(tripId, "edit");
  const last = await db.layover.findFirst({ where: { tripId, leg }, orderBy: { position: "desc" } });
  await db.layover.create({ data: { tripId, leg, name: "", position: (last?.position ?? -1) + 1 } });
  revalidatePath("/trips/" + tripId);
}

export async function updateLayover(id, value) {
  const layover = await db.layover.findUnique({ where: { id } });
  if (!layover) throw new Error("NOT_FOUND");
  await assertCan(layover.tripId, "edit");
  const name = String(value || "").trim();
  const coords = name ? await geocodeStop(name) : null;
  await db.layover.update({ where: { id }, data: { name, lat: coords?.lat ?? null, lng: coords?.lng ?? null } });
  revalidatePath("/trips/" + layover.tripId);
  revalidatePath("/trips");
}

export async function deleteLayover(id) {
  const layover = await db.layover.findUnique({ where: { id } });
  if (!layover) return;
  await assertCan(layover.tripId, "edit");
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
      include: { _count: { select: { photos: true, comments: true } } }
    })
  ]);
  const { groups } = groupPagesByDestination(destinations, dayPages);
  const mine = groups.get(dest.id) || [];
  // Activity pages and subpages both count as something written.
  const withActivities = new Set((await db.page.findMany({
    where: { tripId: dest.tripId, parentId: { in: mine.map((p) => p.id) } },
    select: { parentId: true }
  })).map((a) => a.parentId));
  const blank = mine.filter((p) =>
    !p.title && !p.notes && !p.weather && !p.spend && !p.steps && !p.tags &&
    p._count.photos === 0 && p._count.comments === 0 && !withActivities.has(p.id));

  await db.$transaction([
    db.page.deleteMany({ where: { id: { in: blank.map((p) => p.id) } } }),
    db.destination.delete({ where: { id: dest.id } })
  ]);
  return { removedPages: blank.length, keptPages: mine.length - blank.length };
}

export async function deleteDestination(id) {
  const dest = await db.destination.findUnique({ where: { id } });
  if (!dest) return;
  await assertCan(dest.tripId, "delete");
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
  await assertCan(dest.tripId, "delete");
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
  const { trip } = await assertCan(tripId, "edit");
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
  await assertCan(tripId, "edit");
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

// Drag and drop on the carousel's page tabs. With a parentId, the page becomes
// a subpage of that one, at `index` among its subpages (the end if left out);
// a page that had subpages of its own brings them along right after it, since
// subpages only go one level deep. With parentId null it's a main page again,
// back in date order. Both must be day pages of the same trip.
export async function movePage(id, parentId, index) {
  const page = await db.page.findUnique({ where: { id } });
  if (!page || page.kind !== "DAY") throw new Error("NOT_FOUND");
  await assertCan(page.tripId, "edit");

  if (!parentId) {
    if (page.parentId) await db.page.update({ where: { id }, data: { parentId: null } });
    revalidatePath("/trips/" + page.tripId);
    return;
  }

  const parent = await db.page.findUnique({ where: { id: parentId } });
  if (!parent || parent.tripId !== page.tripId || parent.kind !== "DAY" || parent.id === id) throw new Error("NOT_FOUND");
  if (parent.parentId) throw new Error("NESTED"); // the tabs only offer main pages as targets

  const [own, siblings] = await Promise.all([
    db.page.findMany({ where: { parentId: id, kind: "DAY" }, orderBy: [{ position: "asc" }, { date: "asc" }] }),
    db.page.findMany({ where: { parentId, kind: "DAY", NOT: { id } }, orderBy: [{ position: "asc" }, { date: "asc" }] })
  ]);
  const order = siblings.map((p) => p.id);
  const at = Number.isInteger(index) ? Math.max(0, Math.min(index, order.length)) : order.length;
  order.splice(at, 0, id, ...own.map((p) => p.id));
  await db.$transaction(order.map((pid, i) =>
    db.page.update({ where: { id: pid }, data: { parentId, position: i } })));
  revalidatePath("/trips/" + page.tripId);
}

const PAGE_FIELDS = ["title", "notes", "place", "weather", "spend", "steps", "tags", "time"];

export async function updatePage(id, field, value) {
  const page = await db.page.findUnique({ where: { id } });
  if (!page) throw new Error("NOT_FOUND");
  await assertCan(page.tripId, "edit");

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
  await assertCan(page.tripId, "delete");
  // The page and its activity pages, children first (see deleteTripsTx). Its
  // subpages are pages in their own right: they stay, as main pages.
  const activities = { parentId: id, kind: "ACTIVITY" };
  const pages = { OR: [{ id }, activities] };
  await db.$transaction([
    db.comment.deleteMany({ where: { page: pages } }),
    db.photo.deleteMany({ where: { page: pages } }),
    db.page.deleteMany({ where: activities }),
    db.page.updateMany({ where: { parentId: id, kind: "DAY" }, data: { parentId: null } }),
    db.page.delete({ where: { id } })
  ]);
  revalidatePath("/trips/" + page.tripId);
  redirect("/trips/" + page.tripId);
}

/* ── photos ───────────────────────────────────────────────────────── */

export async function uploadPhotos(_prev, form) {
  const pageId = String(form.get("pageId") || "");
  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!page) return { error: "That page no longer exists." };
  const { user } = await assertCan(page.tripId, "upload");

  const files = form.getAll("photos").filter((f) => f && typeof f.arrayBuffer === "function" && f.size > 0);
  if (!files.length) return { error: "Choose at least one photo." };

  // The grid sends one photo per call (see components/Photos.jsx), so a
  // failure here is that photo's alone — report it rather than throw, which
  // production would turn into a generic error.
  let position = await db.photo.count({ where: { pageId } });
  let saved = 0;
  for (const file of files) {
    if (!String(file.type || "").startsWith("image/")) continue;
    let url;
    try {
      url = await saveUpload(file);
    } catch (err) {
      console.error("[trekkster] photo upload failed: " + err.message);
      return { error: /larger than/.test(err.message) ? err.message : "It couldn't be saved — try again." };
    }
    await db.photo.create({ data: { pageId, url, position: position++, uploadedById: user.id } });
    saved++;
  }
  if (!saved) return { error: "That file isn't a photo." };
  const trip = await db.trip.findUnique({ where: { id: page.tripId } });
  if (trip && !trip.coverUrl) {
    const first = await db.photo.findFirst({ where: { pageId, kind: "IMAGE" }, orderBy: { position: "asc" } });
    if (first) await db.trip.update({ where: { id: trip.id }, data: { coverUrl: first.url } });
  }
  revalidatePath("/trips/" + page.tripId);
  return { ok: true };
}

export async function setTripCover(_prev, form) {
  const tripId = String(form.get("tripId") || "");
  await assertCan(tripId, "edit");
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

/* ── videos ───────────────────────────────────────────────────────── */

// Videos are too big to pass through the app, so the browser uploads them
// straight to the bucket: this hands it a short-lived upload URL for a fresh
// file name, then finishVideoUpload checks what arrived and adds it to the
// page. (Without a bucket — development — the URL is the app's own
// /api/media-upload, with a signed token standing in for the pre-signing.)
const VIDEO_NAME = /^[0-9a-f-]{36}\.(mp4|m4v|mov|webm)$/;

export async function startVideoUpload(pageId, { type, size, duration } = {}) {
  const page = await db.page.findUnique({ where: { id: String(pageId || "") } });
  if (!page) return { error: "That page no longer exists." };
  await assertCan(page.tripId, "upload");
  const ext = videoExtension(type);
  if (!ext) return { error: "That video format isn't supported — use MP4, MOV or WebM." };
  if (!(Number(size) > 0)) return { error: "That video is empty." };
  if (Number(size) > MAX_VIDEO_BYTES) return { error: "Videos can be up to " + MAX_VIDEO_BYTES / 1024 / 1024 + " MB." };
  if (Number(duration) > MAX_VIDEO_SECONDS + 0.5) return { error: "Videos can be up to " + MAX_VIDEO_SECONDS + " seconds long." };

  const name = randomUUID() + ext;
  const uploadUrl = storeConfigured()
    ? await presignPut(name)
    : "/api/media-upload?t=" + encodeURIComponent(mediaUploadToken(name));
  return { name, uploadUrl };
}

// form: pageId, name (from startVideoUpload), duration, poster (a JPEG frame
// the browser captured; optional).
export async function finishVideoUpload(form) {
  const page = await db.page.findUnique({ where: { id: String(form.get("pageId") || "") } });
  if (!page) return { error: "That page no longer exists." };
  const { user } = await assertCan(page.tripId, "upload");
  const name = String(form.get("name") || "");
  if (!VIDEO_NAME.test(name)) throw new Error("BAD_NAME");

  // Check what actually arrived — the size the browser claimed isn't proof.
  let size = 0;
  if (storeConfigured()) {
    size = (await objectInfo(name))?.size || 0;
  } else {
    size = await stat(UPLOAD_DIR + "/" + name).then((s) => s.size, () => 0);
  }
  if (!size) return { error: "The video didn't arrive — try again." };
  if (size > MAX_VIDEO_BYTES) {
    await (storeConfigured() ? deleteObject(name) : unlink(UPLOAD_DIR + "/" + name)).catch(() => {});
    return { error: "Videos can be up to " + MAX_VIDEO_BYTES / 1024 / 1024 + " MB." };
  }

  let posterUrl = null;
  const poster = form.get("poster");
  if (poster && typeof poster.arrayBuffer === "function" && poster.size && String(poster.type).startsWith("image/")) {
    posterUrl = await saveUpload(poster).catch(() => null);
  }
  const duration = Number(form.get("duration"));
  const position = await db.photo.count({ where: { pageId: page.id } });
  await db.photo.create({
    data: {
      pageId: page.id, url: mediaUrl(name), kind: "VIDEO", posterUrl,
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 10) / 10 : null,
      position, uploadedById: user.id
    }
  });
  revalidatePath("/trips/" + page.tripId);
  revalidatePath("/trips/" + page.tripId + "/pages/" + page.id);
  return { ok: true };
}

// How the cover sits in its frame — see coverFrame() in lib/format.js.
export async function setCoverFrame(tripId, frame) {
  await assertCan(tripId, "edit");
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
  await assertPhotoAccess(photo);
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

// Saves a page's photo order. `ids` must be exactly that page's photos (in
// the new order) — anything else is refused rather than half-applied.
export async function reorderPhotos(pageId, ids) {
  const page = await db.page.findUnique({ where: { id: String(pageId || "") } });
  if (!page) throw new Error("NOT_FOUND");
  await assertCan(page.tripId, "edit");
  const current = await db.photo.findMany({ where: { pageId: page.id }, select: { id: true } });
  const wanted = Array.isArray(ids) ? ids.map(String) : [];
  const known = new Set(current.map((p) => p.id));
  if (wanted.length !== known.size || new Set(wanted).size !== wanted.length || !wanted.every((id) => known.has(id))) {
    return { error: "The photos changed — reload and try again." };
  }
  await db.$transaction(wanted.map((id, position) => db.photo.update({ where: { id }, data: { position } })));
  revalidatePath("/trips/" + page.tripId);
  revalidatePath("/trips/" + page.tripId + "/pages/" + page.id);
  return { ok: true };
}

/* ── comments ─────────────────────────────────────────────────────── */

// Anyone on the trip, at any level, can comment on its pages.
export async function addComment(pageId, body) {
  const page = await db.page.findUnique({ where: { id: String(pageId || "") } });
  if (!page) throw new Error("NOT_FOUND");
  const { user } = await assertCan(page.tripId, "comment");
  const text = String(body || "").trim().slice(0, 4000);
  if (!text) return { error: "Write something first." };
  await db.comment.create({ data: { pageId: page.id, userId: user.id, body: text } });
  revalidatePath("/trips/" + page.tripId);
  revalidatePath("/trips/" + page.tripId + "/pages/" + page.id);
  return { ok: true };
}

// Your own comments, or anyone's with Full access / as the owner.
export async function deleteComment(id) {
  const comment = await db.comment.findUnique({ where: { id: String(id || "") }, include: { page: true } });
  if (!comment) return { ok: true };
  const { user, role } = await assertCan(comment.page.tripId, "comment");
  if (comment.userId !== user.id && !can(role, "delete")) throw new Error("FORBIDDEN");
  await db.comment.delete({ where: { id: comment.id } });
  revalidatePath("/trips/" + comment.page.tripId);
  revalidatePath("/trips/" + comment.page.tripId + "/pages/" + comment.pageId);
  return { ok: true };
}

export async function deletePhoto(id) {
  const photo = await db.photo.findUnique({ where: { id }, include: { page: true } });
  if (!photo) return;
  await assertPhotoAccess(photo);
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
    db.comment.deleteMany({ where: { userId } }),
    db.photo.updateMany({ where: { uploadedById: userId }, data: { uploadedById: null } }),
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
  if (!target || !target.verified) return { error: "User not found." };

  const existing = await findBuddyRow(me.id, targetUserId);
  if (existing) {
    if (existing.status === "BLOCKED") return { error: "You can't send a request here." };
    if (existing.status === "ACCEPTED") return { error: "You're already travel buddies." };
    return { error: "A request is already pending." };
  }
  const request = await db.buddy.create({ data: { requesterId: me.id, addresseeId: targetUserId, status: "PENDING" } });

  // Email them links to answer it. Not awaited: a slow or failing mail server
  // shouldn't hold up (or undo) the request, which is on their Buddies page
  // either way. send() logs its own failures.
  const base = await appUrl();
  const token = await signBuddyToken(request.id, target.id);
  const link = (choice) => base + "/buddies/respond?t=" + encodeURIComponent(token) + "&do=" + choice;
  sendBuddyRequestEmail(target.email, {
    fromName: me.name, fromHandle: me.handle, profileUrl: base + "/u/" + me.handle,
    links: { accept: link("accept"), decline: link("decline"), block: link("block") }
  }).catch((err) => console.error("[trekkster] buddy request email failed: " + err.message));

  revalidatePath("/buddies");
  return { ok: true };
}

// The confirmation page that a buddy-request email links to posts here. The
// signed token stands in for signing in: it names one request and the person
// it was sent to, and only works while that request is still pending.
export async function respondToBuddyEmail(form) {
  const token = String(form.get("t") || "");
  const choice = String(form.get("choice") || "");
  if (!["accept", "decline", "block"].includes(choice)) throw new Error("BAD_CHOICE");
  const claim = await verifyBuddyToken(token);
  const back = "/buddies/respond?t=" + encodeURIComponent(token);
  if (!claim) redirect(back);

  const row = await db.buddy.findUnique({ where: { id: claim.requestId } });
  if (!row || row.status !== "PENDING" || row.addresseeId !== claim.addresseeId) redirect(back);

  if (choice === "accept") {
    await db.buddy.update({ where: { id: row.id }, data: { status: "ACCEPTED" } });
  } else if (choice === "decline") {
    await db.buddy.delete({ where: { id: row.id } });
  } else {
    await blockPair(row.addresseeId, row.requesterId);
  }
  revalidatePath("/buddies");
  redirect(back + "&done=" + choice);
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

// meId blocks targetUserId: the pair's one row becomes a block owned by meId
// (shared trips between them are revoked either way).
async function blockPair(meId, targetUserId) {
  const existing = await findBuddyRow(meId, targetUserId);
  if (existing?.status === "BLOCKED" && existing.requesterId !== meId) {
    // They already blocked you. Leave their block in place — taking the row
    // over would let you unblock it and erase their block entirely.
    await revokeSharedTrips(meId, targetUserId);
    return;
  }
  if (existing) {
    await db.buddy.update({
      where: { id: existing.id },
      data: { requesterId: meId, addresseeId: targetUserId, status: "BLOCKED" }
    });
  } else {
    await db.buddy.create({ data: { requesterId: meId, addresseeId: targetUserId, status: "BLOCKED" } });
  }
  await revokeSharedTrips(meId, targetUserId);
}

export async function blockUser(targetUserId) {
  const me = await requireUser();
  if (targetUserId === me.id) return { error: "That's you." };
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { error: "User not found." };
  await blockPair(me.id, targetUserId);
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
