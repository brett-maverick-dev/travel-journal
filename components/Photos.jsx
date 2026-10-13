"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { uploadPhotos, deletePhoto, updatePhoto, reorderPhotos } from "@/app/actions";
import { compressInputFiles } from "@/lib/compress-image";
import Field from "./Field";
import PhotoImage from "./PhotoImage";
import PhotoLightbox from "./PhotoLightbox";

// A page's photo grid. Click a photo to enlarge it. With canEdit: add
// photos, drag them into a new order (by the grip handle, with a mouse or
// finger, or with the arrow keys while it's focused), turn them upright
// (rotate left/right), remove them, and write a description under each;
// without it (the public trip view), descriptions are shown as text.
export default function Photos({ pageId, photos, canEdit }) {
  const [state, action, pending] = useActionState(uploadPhotos, null);
  const [shrinking, setShrinking] = useState(false);
  const [open, setOpen] = useState(null); // index of the enlarged photo
  const [turns, setTurns] = useState({}); // id → rotation, shown before the save lands
  const [order, setOrder] = useState(null); // ids in a not-yet-saved order, or null
  const [dragId, setDragId] = useState(null);
  const [reorderError, setReorderError] = useState("");
  const [, startSaving] = useTransition();

  // Photos added or removed (an upload, a delete, another tab) — drop any
  // local order and follow the server's again.
  const idKey = photos.map((p) => p.id).sort().join(",");
  useEffect(() => { setOrder(null); }, [idKey]);

  const byId = new Map(photos.map((p) => [p.id, p]));
  const ordered = order ? order.map((id) => byId.get(id)).filter(Boolean) : photos;
  const shown = ordered.map((p) => (p.id in turns ? { ...p, rotation: turns[p.id] } : p));
  const ids = shown.map((p) => p.id);
  const latest = useRef(ids); // the order as of the last move, for in-flight drags
  latest.current = ids;

  const moveTo = (id, index, from = ids) => {
    const at = from.indexOf(id);
    const to = Math.max(0, Math.min(from.length - 1, index));
    if (at < 0 || at === to) return from;
    const next = [...from];
    next.splice(to, 0, next.splice(at, 1)[0]);
    latest.current = next; // further moves in this drag build on it straight away
    setOrder(next);
    return next;
  };
  const saveOrder = (next, before) => {
    if (next.join() === before.join()) return;
    setReorderError("");
    startSaving(async () => {
      const res = await reorderPhotos(pageId, next);
      if (res?.error) { setReorderError(res.error); setOrder(null); }
    });
  };

  // Pointer drag on the grip: the photo under the pointer is where the
  // dragged one goes, and the grid reflows live as it moves. The move/up
  // listeners live on the window, not the grip: reordering moves the dragged
  // photo's DOM node, which would drop a pointer capture mid-drag.
  const onGripDown = (e, id) => {
    if (e.pointerType === "touch") return; // fingers: see the touch handlers below
    e.preventDefault();
    e.stopPropagation();
    const before = ids;
    setDragId(id);
    const onMove = (ev) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-photo-id]");
      const target = over?.getAttribute("data-photo-id");
      if (target && target !== id) moveTo(id, latest.current.indexOf(target), latest.current);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragId(null);
      saveOrder(latest.current, before);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  // Fingers get their own path. A touch on the grip must not start a page
  // scroll, and touch-action alone isn't honoured everywhere, so these are
  // native non-passive listeners that cancel the scroll themselves (React's
  // touch handlers are passive and can't).
  const grid = useRef(null);
  const actions = useRef(null);
  actions.current = { moveTo, saveOrder };
  useEffect(() => {
    const el = grid.current;
    if (!el || !canEdit) return;
    const onTouchStart = (e) => {
      const grip = e.target.closest?.(".photo-grip");
      if (!grip || e.touches.length !== 1) return;
      e.preventDefault();
      const id = grip.closest("[data-photo-id]")?.getAttribute("data-photo-id");
      if (!id) return;
      const before = latest.current;
      setDragId(id);
      const onMove = (ev) => {
        ev.preventDefault();
        const t = ev.touches[0];
        const over = document.elementFromPoint(t.clientX, t.clientY)?.closest("[data-photo-id]");
        const target = over?.getAttribute("data-photo-id");
        if (target && target !== id) actions.current.moveTo(id, latest.current.indexOf(target), latest.current);
      };
      const onEnd = () => {
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);
        window.removeEventListener("touchcancel", onEnd);
        setDragId(null);
        actions.current.saveOrder(latest.current, before);
      };
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
      window.addEventListener("touchcancel", onEnd);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => el.removeEventListener("touchstart", onTouchStart);
  }, [canEdit]);

  // Keyboard: arrows move the focused photo one place (up/down a row of 3).
  const onGripKey = (e, id) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const before = ids;
    const next = moveTo(id, ids.indexOf(id) + step);
    saveOrder(next, before);
    requestAnimationFrame(() => document.querySelector("[data-photo-id='" + id + "'] .photo-grip")?.focus());
  };

  const onPick = async (e) => {
    const input = e.currentTarget;
    setShrinking(true);
    try { await compressInputFiles(input); } finally { setShrinking(false); }
    input.form.requestSubmit();
  };

  const rotate = (photo, delta) => {
    const next = (((Number(photo.rotation) || 0) + delta) % 360 + 360) % 360;
    setTurns((t) => ({ ...t, [photo.id]: next }));
    startSaving(() => updatePhoto(photo.id, "rotation", next));
  };

  return (
    <div>
      <div ref={grid} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, alignItems: "start" }}>
        {shown.map((p, i) => (
          <figure key={p.id} data-photo-id={p.id} className={dragId === p.id ? "photo-dragging" : undefined}
            style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div className="photo-tile" role="button" tabIndex={0} aria-label={"Enlarge photo" + (p.caption ? ": " + p.caption : "")}
              onClick={() => setOpen(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(i); } }}>
              <PhotoImage photo={p} />
              {canEdit && shown.length > 1 && (
                <button type="button" className="btn btn-icon photo-grip"
                  aria-label={"Move photo " + (i + 1) + " of " + shown.length + " — drag, or use the arrow keys"}
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => onGripDown(e, p.id)}
                  onKeyDown={(e) => onGripKey(e, p.id)}>
                  <i className="ph ph-dots-six-vertical" />
                </button>
              )}
              {canEdit && (
                <span className="photo-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-icon" aria-label="Rotate left" title="Rotate left"
                    onClick={() => rotate(p, -90)}><i className="ph ph-arrow-counter-clockwise" /></button>
                  <button type="button" className="btn btn-icon" aria-label="Rotate right" title="Rotate right"
                    onClick={() => rotate(p, 90)}><i className="ph ph-arrow-clockwise" /></button>
                  <button type="button" className="btn btn-icon" aria-label="Remove photo" title="Remove photo"
                    onClick={() => deletePhoto(p.id)}><i className="ph ph-x" /></button>
                </span>
              )}
            </div>
            {canEdit ? (
              <Field as="textarea" rows={2} value={p.caption} placeholder="Add a description…"
                save={updatePhoto.bind(null, p.id, "caption")}
                style={{ fontSize: 12, lineHeight: 1.45, padding: "6px 8px", minHeight: 0, resize: "vertical" }} />
            ) : p.caption ? (
              <figcaption className="text-muted" style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{p.caption}</figcaption>
            ) : null}
          </figure>
        ))}
        {canEdit && (
          <form action={action} style={{ aspectRatio: "4 / 3" }}>
            <input type="hidden" name="pageId" value={pageId} />
            <label className="dashed" style={{
              display: "grid", placeItems: "center", width: "100%", height: "100%",
              gap: 6, fontSize: 12, textAlign: "center", padding: 10
            }}>
              <i className="ph ph-image-square" style={{ fontSize: 20 }} />
              {shrinking ? "Optimising…" : pending ? "Uploading…" : "Add photos"}
              <input hidden type="file" name="photos" accept="image/*" multiple onChange={onPick} />
            </label>
          </form>
        )}
      </div>
      {state?.error && <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>{state.error}</p>}
      {reorderError && <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>{reorderError}</p>}

      {open != null && shown[open] && (
        <PhotoLightbox photos={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
          onRotate={canEdit ? rotate : null} />
      )}
    </div>
  );
}
