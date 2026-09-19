"use client";

import { useState, useTransition } from "react";
import { updateHandle } from "@/app/actions";

export default function HandleField({ handle }) {
  const [draft, setDraft] = useState(handle);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const commit = () => {
    if (draft === handle) return;
    start(async () => {
      const res = await updateHandle(draft);
      if (res?.error) { setError(res.error); setDraft(handle); }
      else { setError(""); if (res?.handle) setDraft(res.handle); }
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span className="text-muted" style={{ fontSize: 13 }}>trekkster.app/u/</span>
        <input className="input" value={draft} disabled={pending}
          onChange={(e) => { setDraft(e.target.value); setError(""); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{ fontSize: 13, minHeight: 32, padding: "3px 8px", opacity: pending ? 0.6 : 1, width: 180 }} />
      </div>
      {error && <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-accent-300)" }}>{error}</p>}
    </div>
  );
}
