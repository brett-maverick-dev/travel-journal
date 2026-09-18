"use client";

import { useTransition } from "react";
import { setVisibility } from "@/app/actions";

export default function VisibilityToggle({ tripId, visibility, shareUrl }) {
  const [pending, start] = useTransition();
  const set = (v) => start(() => setVisibility(tripId, v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", opacity: pending ? 0.6 : 1 }}>
      <div className="seg" style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
        <label className="seg-opt">
          <input type="radio" name="vis" checked={visibility === "PRIVATE"} onChange={() => set("PRIVATE")} />
          <i className="ph ph-lock-simple" /><span>Private</span>
        </label>
        <label className="seg-opt">
          <input type="radio" name="vis" checked={visibility === "PUBLIC"} onChange={() => set("PUBLIC")} />
          <i className="ph ph-globe-hemisphere-west" /><span>Public</span>
        </label>
      </div>
      {visibility === "PUBLIC" && (
        <a href={shareUrl} className="text-muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ph ph-link" />{shareUrl}
        </a>
      )}
    </div>
  );
}
