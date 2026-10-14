import { db } from "./db.js";
import { SOCIALS } from "./format.js";

// Finding people to send a buddy request to — by name, username, social
// handle, or exact email address.
//
// Email is deliberately exact-match only: partial matching would let anyone
// probe which addresses (or which company's addresses) have an account.
// Results never include the email itself.
//
// Social links are stored as full URLs, so a handle is matched against the
// handle part of the link (its first path segment, minus any "@"), never the
// whole URL — searching "instagram" shouldn't list everyone with an
// Instagram link.

const MIN_LENGTH = 2;
const LIMIT = 20;
const SOCIAL_FIELDS = SOCIALS.map((s) => s.field);
const SOCIAL_LABEL = Object.fromEntries(SOCIALS.map((s) => [s.field, s.label]));
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// "https://instagram.com/JaneDoe/" → "janedoe"; "https://tiktok.com/@jane" → "jane"
export function socialHandle(url) {
  try {
    const first = new URL(url).pathname.split("/").filter(Boolean)[0] || "";
    return decodeURIComponent(first).replace(/^@/, "").toLowerCase();
  } catch {
    return "";
  }
}

// What was typed, reduced to the thing to look for: a pasted profile link
// becomes its handle, and a leading "@" is dropped.
export function normalizeQuery(raw) {
  let q = String(raw || "").trim();
  if (EMAIL.test(q)) return { term: q.toLowerCase(), email: q.toLowerCase() };
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\/\S+/i.test(q)) {
    const handle = socialHandle(/^https?:\/\//i.test(q) ? q : "https://" + q);
    if (handle) q = handle;
  }
  return { term: q.replace(/^@+/, "").toLowerCase(), email: null };
}

// 0 = no match. Exact beats prefix (of the value, or of any word in a name)
// beats contains.
function rank(value, term, exact, prefix, contains) {
  const v = String(value || "").toLowerCase();
  if (!v || !term) return 0;
  if (v === term) return exact;
  if (v.startsWith(term) || v.split(/\s+/).some((w) => w.startsWith(term))) return prefix;
  return v.includes(term) ? contains : 0;
}

// Returns [{ user, matchedBy }] best first. matchedBy explains a match the
// visible name/@username doesn't ("Instagram @janedoe", "email address").
export async function searchUsers(raw, meId) {
  const { term, email } = normalizeQuery(raw);
  if (!email && term.length < MIN_LENGTH) return [];

  const candidates = await db.user.findMany({
    where: {
      id: { not: meId },
      verified: true,
      OR: email
        ? [{ email }]
        : [
            { handle: { contains: term } },
            { name: { contains: term } },
            ...SOCIAL_FIELDS.map((f) => ({ [f]: { contains: term } }))
          ]
    },
    select: {
      id: true, handle: true, name: true, avatarUrl: true, email: true,
      ...Object.fromEntries(SOCIAL_FIELDS.map((f) => [f, true]))
    },
    take: 100
  });

  const scored = candidates.map((u) => {
    if (email) return { u, score: u.email === email ? 100 : 0, matchedBy: "email address" };
    let best = { score: Math.max(rank(u.handle, term, 90, 70, 50), rank(u.name, term, 85, 65, 45)), matchedBy: null };
    for (const f of SOCIAL_FIELDS) {
      const handle = socialHandle(u[f]);
      const score = rank(handle, term, 80, 60, 40);
      if (score > best.score) best = { score, matchedBy: SOCIAL_LABEL[f] + " @" + handle };
    }
    return { u, ...best };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.u.name || a.u.handle).localeCompare(b.u.name || b.u.handle))
    .slice(0, LIMIT)
    .map(({ u, matchedBy }) => {
      const { email: _omit, ...user } = u; // never hand the address on
      return { user, matchedBy };
    });
}
