"use client";

import { useState } from "react";
import Link from "next/link";
import TripMap from "@/components/TripMap";
import NewTripDialog from "@/components/NewTripDialog";

const FILTERS = ["All", "Public", "Private"];

export default function TripBrowser({ trips }) {
  const [filter, setFilter] = useState("All");
  const [hoverId, setHoverId] = useState("");

  const shown = trips.filter((t) =>
    filter === "All" ? true : t.visibility === filter.toUpperCase());
  const pins = trips.reduce((n, t) => n + t.stops.length, 0);
  const publicCount = trips.filter((t) => t.visibility === "PUBLIC").length;

  return (
    <div className="page-shell" style={{ paddingTop: 34 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 22, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Your trips</h2>
          <div className="text-muted" style={{ fontSize: 13 }}>
            {trips.length} trips · {pins} destinations · {publicCount} public
          </div>
        </div>
        <NewTripDialog />
      </div>

      <div id="map" style={{ position: "relative" }}>
        <TripMap trips={trips} height={420} hoverId={hoverId} />
        <div style={{ position: "absolute", left: 16, top: 16, display: "flex", gap: 8, pointerEvents: "none" }}>
          <span className="tag tag-neutral" style={{ background: "rgba(22,24,38,.78)" }}>
            <i className="ph ph-map-pin" style={{ marginRight: 5 }} />{pins} pins
          </span>
          <span className="tag tag-neutral" style={{ background: "rgba(22,24,38,.78)" }}>
            Click a pin for the trip · hover a card to find it
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0 16px" }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <label className="seg-opt" key={f}>
              <input type="radio" name="filter" checked={filter === f} onChange={() => setFilter(f)} />
              <span>{f}</span>
            </label>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>Sorted by most recent</span>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 14 }}>
          No trips here yet. Create one and its destinations will appear on the map.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {shown.map((t) => (
            <Link href={t.href} key={t.id} className="trip-card card elev-sm"
              data-sel={hoverId === t.id ? "1" : "0"}
              onMouseEnter={() => setHoverId(t.id)}
              onMouseLeave={() => setHoverId((h) => (h === t.id ? "" : h))}
              style={{ padding: 16, gap: 10, textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div className="card-kicker">{t.country}</div>
                <span style={{ display: "flex", gap: 6 }}>
                  {t.sharedBy && <span className="tag tag-outline">Shared by @{t.sharedBy}</span>}
                  <span className={t.visibility === "PUBLIC" ? "tag tag-accent" : "tag tag-neutral"}>
                    {t.visibility === "PUBLIC" ? "Public" : "Private"}
                  </span>
                </span>
              </div>
              <div className="card-title" style={{ fontSize: 19 }}>{t.name}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>{t.dateRange}</div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, fontSize: 12, color: "var(--color-neutral-400)", marginTop: 2 }}>
                {t.stops.map((s, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    {i > 0 && <i className={"ph " + s.icon} style={{ color: "var(--color-accent-400)", fontSize: 14 }} />}
                    <span>{s.name}</span>
                  </span>
                ))}
              </div>
              <div className="card-meta" style={{ marginTop: 6, justifyContent: "space-between" }}>
                <span>{t.pageLine}</span>
                <span style={{ color: "var(--color-accent)" }}>Open<i className="ph ph-arrow-right" style={{ marginLeft: 5 }} /></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
