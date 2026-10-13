"use client";

import { useRef, useState, useTransition } from "react";
import { setCoverFrame } from "@/app/actions";
import { coverStyle } from "@/lib/format";

const DEFAULT = { zoom: 1, x: 50, y: 50 };

// The trip header's cover photo, plus (for anyone who can edit the trip) an
// "Adjust cover" mode: drag to move the focus point, a slider to zoom, then
// save. Only the framing is stored (Trip.coverZoom/coverX/coverY), never a
// re-cropped file, so it can be changed again at any time.
export default function CoverImage({ tripId, url, frame, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(frame);
  const [pending, start] = useTransition();
  const img = useRef(null);
  const drag = useRef(null);

  const shown = editing ? draft : frame;

  // How many pixels the visible photo moves per 1% change of the focus
  // point, on each axis. object-position slides the photo across its
  // overflow, and the zoom (a scale about the focus point) adds to that.
  const pxPerPercent = () => {
    const el = img.current;
    const boxW = el.clientWidth, boxH = el.clientHeight;
    const fit = Math.max(boxW / (el.naturalWidth || boxW), boxH / (el.naturalHeight || boxH));
    const overflowX = (el.naturalWidth || boxW) * fit - boxW;
    const overflowY = (el.naturalHeight || boxH) * fit - boxH;
    const z = draft.zoom;
    return {
      x: (boxW * (z - 1) + z * overflowX) / 100,
      y: (boxH * (z - 1) + z * overflowY) / 100
    };
  };

  const onPointerDown = (e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    drag.current = { x: e.clientX, y: e.clientY, from: draft, rate: pxPerPercent() };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const clamp = (v) => Math.min(100, Math.max(0, v));
    // Dragging right should move the photo right — i.e. the focus point left.
    const x = d.rate.x > 0.01 ? clamp(d.from.x - (e.clientX - d.x) / d.rate.x) : d.from.x;
    const y = d.rate.y > 0.01 ? clamp(d.from.y - (e.clientY - d.y) / d.rate.y) : d.from.y;
    setDraft({ ...d.from, x, y });
  };
  const onPointerUp = () => { drag.current = null; };

  const begin = () => { setDraft(frame); setEditing(true); };
  const cancel = () => { setDraft(frame); setEditing(false); };
  const save = () => start(async () => {
    await setCoverFrame(tripId, draft);
    setEditing(false);
  });

  return (
    <>
      <img ref={img} src={url} alt="" draggable={false} style={coverStyle({
        coverZoom: shown.zoom, coverX: shown.x, coverY: shown.y
      })} />

      {canEdit && !editing && (
        <button type="button" className="btn btn-secondary" onClick={begin}
          style={{ position: "absolute", top: 22, right: 34, zIndex: 2, background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
          <i className="ph ph-arrows-out" />Adjust cover
        </button>
      )}

      {editing && (
        <>
          <div onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            style={{
              position: "absolute", inset: 0, zIndex: 5, cursor: drag.current ? "grabbing" : "grab", touchAction: "none",
              boxShadow: "inset 0 0 0 2px var(--color-accent)"
            }}>
            <span className="tag tag-neutral" style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
              pointerEvents: "none", background: "rgba(22,24,38,.78)"
            }}>
              <i className="ph ph-hand-grabbing" style={{ marginRight: 6 }} />Drag to reposition
            </span>
          </div>
          <div style={{
            position: "absolute", top: 18, right: 34, zIndex: 6, display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: "var(--radius-md)", background: "color-mix(in srgb, var(--color-bg) 85%, transparent)",
            boxShadow: "var(--shadow-md)"
          }}>
            <i className="ph ph-magnifying-glass-minus" style={{ color: "var(--color-neutral-400)" }} />
            <input type="range" min="1" max="3" step="0.01" value={draft.zoom} aria-label="Zoom"
              onChange={(e) => setDraft((d) => ({ ...d, zoom: Number(e.target.value) }))} style={{ width: 140 }} />
            <i className="ph ph-magnifying-glass-plus" style={{ color: "var(--color-neutral-400)" }} />
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(DEFAULT)} disabled={pending}>Reset</button>
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={pending}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
