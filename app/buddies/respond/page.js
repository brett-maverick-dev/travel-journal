import Link from "next/link";
import { db } from "@/lib/db";
import { verifyBuddyToken } from "@/lib/buddy-token";
import { respondToBuddyEmail } from "@/app/actions";

export const metadata = { title: "Travel buddy request — Trekkster", robots: { index: false } };

const CHOICES = [
  { choice: "accept", label: "Accept", icon: "ph-check" },
  { choice: "decline", label: "Decline", icon: "ph-x" },
  { choice: "block", label: "Block", icon: "ph-prohibit" }
];

// Where a buddy-request email's links land. Opening it changes nothing —
// mail scanners open links on their own — the buttons do, after a click.
// The signed token in the link stands in for signing in (see
// lib/buddy-token.js), so this works from any device.
export default async function RespondToBuddyRequest({ searchParams }) {
  const { t = "", do: wanted = "", done = "" } = await searchParams;
  const claim = await verifyBuddyToken(t);
  const row = claim
    ? await db.buddy.findUnique({ where: { id: claim.requestId }, include: { requester: true, addressee: true } })
    : null;
  // The other person — whichever side of the row they're on now (a block
  // turns the row around so the blocker owns it).
  const from = row ? (row.requesterId === claim.addresseeId ? row.addressee : row.requester) : null;
  const who = from ? (from.name || "@" + from.handle) : "them";

  let body;
  if (done) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>
          {done === "accept" ? "You're now travel buddies with " + who + "." :
            done === "block" ? "You've blocked " + who + "." : "Request declined."}
        </h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          {done === "accept" ? "They can now add you to their trips, and you can add them to yours." :
            done === "block" ? "They can't send you another request. You can unblock them from your Buddies page." :
              "They won't be told. They can send another request later."}
        </p>
      </>
    );
  } else if (!claim) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>This link has expired or isn't valid</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Request links work for 30 days. Sign in to answer any pending requests from your Buddies page.
        </p>
      </>
    );
  } else if (!row || row.status !== "PENDING" || row.addresseeId !== claim.addresseeId) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>This request has already been answered</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Or it was cancelled. Your Buddies page shows where things stand.
        </p>
      </>
    );
  } else {
    const initials = (from.name || from.handle || "?").slice(0, 2).toUpperCase();
    body = (
      <>
        <div className="card-kicker">Travel buddy request</div>
        <Link href={"/u/" + from.handle} style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", textDecoration: "none" }}>
          <span style={{
            width: 48, height: 48, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
            fontSize: 15, background: "var(--color-accent-800)", color: "var(--color-accent-100)", flexShrink: 0
          }}>
            {from.avatarUrl ? <img src={from.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 18 }}>{from.name || "@" + from.handle}</span>
            <span className="text-muted" style={{ fontSize: 13 }}>@{from.handle} · see their profile</span>
          </span>
        </Link>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          wants to be your travel buddy. Buddies can add each other to trips as collaborators.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CHOICES.map(({ choice, label, icon }) => (
            <form key={choice} action={respondToBuddyEmail}>
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="choice" value={choice} />
              <button type="submit" className={"btn " + (wanted === choice ? "btn-primary" : "btn-secondary")}
                autoFocus={wanted === choice}>
                <i className={"ph " + icon} />{label}
              </button>
            </form>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div style={{ width: "min(440px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 17 }}>Trekkster</span>
        </div>
        <div className="card elev-sm" style={{ padding: 26, gap: 14 }}>
          {body}
        </div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 14 }}>
          <Link href="/buddies">Go to your Buddies page</Link>
        </div>
      </div>
    </div>
  );
}
