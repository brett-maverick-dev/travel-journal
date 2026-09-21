"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addTripBuddy, removeTripBuddy } from "@/app/actions";

export default function TripBuddies({ tripId, isOwner, companions, available }) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(available[0]?.id || "");

  if (!isOwner && companions.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: pending ? 0.6 : 1 }}>
      {companions.length > 0 && (
        <span className="text-muted" style={{ fontSize: 12 }}>Traveling with</span>
      )}
      {companions.map((u) => (
        <div key={u.id} className="tag tag-neutral" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link href={"/u/" + u.handle} style={{ display: "flex", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none" }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
              fontSize: 9, background: "var(--color-accent-800)", color: "var(--color-accent-100)", flexShrink: 0
            }}>
              {u.avatarUrl
                ? <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : (u.name || u.handle || "?").slice(0, 2).toUpperCase()}
            </span>
            {u.name || u.handle}
          </Link>
          {isOwner && (
            <button disabled={pending} title="Remove" onClick={() => start(() => removeTripBuddy(tripId, u.id))}
              style={{
                background: "transparent", border: 0, cursor: "pointer", color: "inherit",
                display: "grid", placeItems: "center", padding: 0, width: 16, height: 16
              }}>
              <i className="ph ph-x" style={{ fontSize: 11 }} />
            </button>
          )}
        </div>
      ))}

      {isOwner && available.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select className="input" value={selected} disabled={pending} onChange={(e) => setSelected(e.target.value)}
            style={{ fontSize: 12, minHeight: 30, padding: "3px 6px" }}>
            {available.map((u) => <option key={u.id} value={u.id}>{u.name || u.handle}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={pending || !selected}
            onClick={() => start(() => addTripBuddy(tripId, selected))}
            style={{ fontSize: 12, padding: "4px 10px" }}>
            <i className="ph ph-user-plus" />Add
          </button>
        </div>
      )}
      {isOwner && companions.length === 0 && available.length === 0 && (
        <Link href="/buddies" className="text-muted" style={{ fontSize: 12 }}>
          Add travel buddies first to share this trip with them.
        </Link>
      )}
    </div>
  );
}
