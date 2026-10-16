"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addTripBuddy, removeTripBuddy, setTripBuddyRole } from "@/app/actions";
import { ROLE_LABEL, ROLE_HINT, SHAREABLE_ROLES, canManageRole } from "@/lib/permissions";

function Avatar({ user, size = 18 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
      fontSize: size / 2, background: "var(--color-accent-800)", color: "var(--color-accent-100)", flexShrink: 0
    }}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (user.name || user.handle || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

// Who's on the trip and at what level. The owner and Full access members
// can add people (from their own travel buddies), change levels and remove
// people — within what lib/permissions.js lets them manage. Anyone who was
// added can leave.
//
//   owner:     the trip's owner (user)
//   members:   [{ user, role }]
//   available: my travel buddies who aren't on the trip yet
export default function TripBuddies({ tripId, myRole, meId, owner, members, available }) {
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const manager = myRole === "OWNER" || myRole === "FULL";
  const grantable = SHAREABLE_ROLES.filter((r) => canManageRole(myRole, r));
  const [level, setLevel] = useState("EDITOR");

  // After an add, that buddy drops out of `available`; fall back to whoever is
  // first now rather than re-submitting someone who's already on the trip.
  const selected = available.some((u) => u.id === picked) ? picked : available[0]?.id || "";
  const run = (fn) => start(async () => {
    const res = await fn();
    setError(res?.error || "");
  });

  if (!manager && members.length === 0) return null;
  // .input is full-width by default; these sit inline with the chips.
  const small = { fontSize: 12, minHeight: 30, padding: "3px 6px", width: "auto", maxWidth: 260 };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: pending ? 0.6 : 1 }}>
      <span className="text-muted" style={{ fontSize: 12 }}>Traveling with</span>

      <div className="tag tag-neutral" style={{ display: "flex", alignItems: "center", gap: 6 }} title="Owner">
        <Link href={"/u/" + owner.handle} style={{ display: "flex", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none" }}>
          <Avatar user={owner} />{owner.id === meId ? "You" : owner.name || owner.handle}
        </Link>
        <span className="text-muted" style={{ fontSize: 10 }}>Owner</span>
      </div>

      {members.map(({ user: u, role }) => {
        const canChange = manager && canManageRole(myRole, role);
        const isMe = u.id === meId;
        return (
          <div key={u.id} className="tag tag-neutral" style={{ display: "flex", alignItems: "center", gap: 6 }}
            title={ROLE_LABEL[role] + " — " + ROLE_HINT[role]}>
            <Link href={"/u/" + u.handle} style={{ display: "flex", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none" }}>
              <Avatar user={u} />{isMe ? "You" : u.name || u.handle}
            </Link>
            {canChange ? (
              <select className="role-select" value={role} disabled={pending} aria-label={"Access level for " + (u.name || u.handle)}
                onChange={(e) => { const next = e.target.value; run(() => setTripBuddyRole(tripId, u.id, next)); }}>
                {grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            ) : (
              <span className="text-muted" style={{ fontSize: 10 }}>{ROLE_LABEL[role]}</span>
            )}
            {(canChange || isMe) && (
              <button disabled={pending} title={isMe ? "Leave this trip" : "Remove from trip"}
                aria-label={isMe ? "Leave this trip" : "Remove " + (u.name || u.handle)}
                onClick={() => {
                  if (isMe && !confirm("Leave this trip? You'll lose access to it unless you're added again.")) return;
                  run(() => removeTripBuddy(tripId, u.id));
                }}
                style={{
                  background: "transparent", border: 0, cursor: "pointer", color: "inherit",
                  display: "grid", placeItems: "center", padding: 0, width: 16, height: 16
                }}>
                <i className={isMe ? "ph ph-sign-out" : "ph ph-x"} style={{ fontSize: 11 }} />
              </button>
            )}
          </div>
        );
      })}

      {manager && available.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <select className="input" value={selected} disabled={pending} onChange={(e) => setPicked(e.target.value)}
            aria-label="Buddy to add" style={small}>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name || u.handle}</option>)}
          </select>
          <select className="input" value={level} disabled={pending} onChange={(e) => setLevel(e.target.value)}
            aria-label="Access level" title={ROLE_HINT[level]} style={small}>
            {grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]} — {ROLE_HINT[r]}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={pending || !selected}
            onClick={() => run(() => addTripBuddy(tripId, selected, level))}
            style={{ fontSize: 12, padding: "4px 10px" }}>
            <i className="ph ph-user-plus" />Add
          </button>
        </div>
      )}
      {error && <span style={{ fontSize: 12, color: "var(--color-accent-300)" }}>{error}</span>}
      {manager && members.length === 0 && available.length === 0 && (
        <Link href="/buddies" className="text-muted" style={{ fontSize: 12 }}>
          Add travel buddies first to share this trip with them.
        </Link>
      )}
    </div>
  );
}
