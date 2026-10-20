"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { uploadPhotos, deletePhoto, updatePhoto, reorderPhotos, startVideoUpload, finishVideoUpload } from "@/app/actions";
import { videoTypeOf, probeVideo, putWithProgress } from "@/lib/upload-video";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, formatDuration } from "@/lib/media";
import { compressImage } from "@/lib/compress-image";
import Field from "./Field";
import PhotoImage from "./PhotoImage";
import PhotoLightbox from "./PhotoLightbox";

// A page's photo grid. Click a photo to enlarge it.
//
//   canUpload   add photos; and rotate, describe or remove your own
//   canEditAll  all of that for anyone's photos, plus reordering
//   meId, ownerId  who "your own" is — photos from before uploaders were
//               recorded (uploadedById null) count as the trip owner's
//
// With canEditAll, the old behaviour in full: add
// photos, drag them into a new order (by the grip handle, with a mouse or
// finger, or with the arrow keys while it's focused), turn them upright
// (rotate left/right), remove them, and write a description under each;
// without it (the public trip view), descriptions are shown as text.
export default function Photos({ pageId, photos, canUpload = false, canEditAll = false, meId, ownerId }) {
  const canEdit = canEditAll; // reordering and the drag handle
  const mine = (p) => canEditAll || (canUpload && (p.uploadedById ?? ownerId) === meId);
  // Uploading several photos: one at a time, each its own request, so the
  // number picked is never limited by the per-request size cap — and one
  // photo failing doesn't stop the rest.
  const [progress, setProgress] = useState(null); // { done, total, step: "Optimising" | "Uploading" }
  const [failures, setFailures] = useState([]);    // [{ name, reason }]
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

  // Uploads the given files one by one — from the picker or a drop.
  // `skipped` are dropped files that weren't images, reported alongside.
  const uploadFiles = async (files, skipped = []) => {
    if (progress) return; // one batch at a time
    setFailures([]);
    const failed = skipped.map((f) => ({ name: f.name, reason: "That file isn't a photo or video." }));
    if (!files.length) { setFailures(failed); return; }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (videoTypeOf(file)) {
        const reason = await uploadVideo(file, i, files.length);
        if (reason) failed.push({ name: file.name, reason });
        continue;
      }
      setProgress({ done: i, total: files.length, step: "Optimising" });
      try {
        const small = await compressImage(file);
        setProgress({ done: i, total: files.length, step: "Uploading" });
        const fd = new FormData();
        fd.append("pageId", pageId);
        fd.append("photos", small);
        const res = await uploadPhotos(null, fd);
        if (res?.error) failed.push({ name: file.name, reason: res.error });
      } catch {
        failed.push({ name: file.name, reason: "The upload didn't go through — check your connection and try again." });
      }
    }
    setProgress(null);
    setFailures(failed);
  };

  // A video goes straight to storage (it's too big to pass through the app):
  // check it here first, get an upload URL, PUT it with progress, then have
  // the server confirm what arrived. Returns why it failed, or null.
  const uploadVideo = async (file, i, total) => {
    const type = videoTypeOf(file);
    if (file.size > MAX_VIDEO_BYTES) return "Videos can be up to " + MAX_VIDEO_BYTES / 1024 / 1024 + " MB.";
    setProgress({ done: i, total, step: "Preparing video" });
    const { duration, poster } = await probeVideo(file);
    if (duration && duration > MAX_VIDEO_SECONDS + 0.5) return "Videos can be up to " + MAX_VIDEO_SECONDS + " seconds long — this one is " + formatDuration(duration) + ".";
    try {
      const start = await startVideoUpload(pageId, { type, size: file.size, duration });
      if (start?.error) return start.error;
      setProgress({ done: i, total, step: "Uploading video", percent: 0 });
      await putWithProgress(start.uploadUrl, file, type, (f) => setProgress({ done: i, total, step: "Uploading video", percent: Math.round(f * 100) }));
      setProgress({ done: i, total, step: "Finishing video" });
      const fd = new FormData();
      fd.append("pageId", pageId);
      fd.append("name", start.name);
      if (duration) fd.append("duration", String(duration));
      if (poster) fd.append("poster", poster);
      const res = await finishVideoUpload(fd);
      return res?.error || null;
    } catch {
      return "The upload didn't go through — check your connection and try again.";
    }
  };

  const onPick = (e) => {
    const input = e.currentTarget;
    const files = [...(input.files || [])];
    input.value = ""; // so picking the same photos again still fires onChange
    if (files.length) uploadFiles(files);
  };

  // Drag and drop: the whole photo area takes files dragged in from the
  // desktop. Only file drags count — the reorder grips use pointer events, not
  // HTML drag and drop, so they never trigger this. The depth counter stops
  // the highlight flickering as the drag crosses child elements.
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const carriesFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const dropProps = !canUpload ? {} : {
    onDragEnter: (e) => { if (!carriesFiles(e)) return; e.preventDefault(); dragDepth.current++; setDropping(true); },
    onDragOver: (e) => { if (!carriesFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = progress ? "none" : "copy"; },
    onDragLeave: (e) => { if (!carriesFiles(e)) return; if (--dragDepth.current <= 0) { dragDepth.current = 0; setDropping(false); } },
    onDrop: (e) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDropping(false);
      const all = [...e.dataTransfer.files];
      const usable = (f) => f.type.startsWith("image/") || Boolean(videoTypeOf(f));
      uploadFiles(all.filter(usable), all.filter((f) => !usable(f)));
    }
  };

  // A file dropped anywhere else on the page would make the browser leave
  // it to open the file — swallow those while there's somewhere to add photos.
  useEffect(() => {
    if (!canUpload) return;
    const stop = (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault(); };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => { window.removeEventListener("dragover", stop); window.removeEventListener("drop", stop); };
  }, [canUpload]);

  const rotate = (photo, delta) => {
    const next = (((Number(photo.rotation) || 0) + delta) % 360 + 360) % 360;
    setTurns((t) => ({ ...t, [photo.id]: next }));
    startSaving(() => updatePhoto(photo.id, "rotation", next));
  };

  return (
    <div className={"photo-drop" + (dropping ? " photo-drop-active" : "")} {...dropProps}>
      {dropping && (
        <div className="photo-drop-hint" aria-hidden="true">
          <span>
            <i className="ph ph-upload-simple" />Drop photos or videos to add them
            <small>From the Photos app? Videos arrive as a still — drag the file from Finder instead.</small>
          </span>
        </div>
      )}
      <div ref={grid} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, alignItems: "start" }}>
        {shown.map((p, i) => (
          <figure key={p.id} data-photo-id={p.id} className={dragId === p.id ? "photo-dragging" : undefined}
            style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div className="photo-tile" role="button" tabIndex={0} aria-label={"Enlarge photo" + (p.caption ? ": " + p.caption : "")}
              onClick={() => setOpen(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(i); } }}>
              <PhotoImage photo={p} />
              {p.kind === "VIDEO" && (
                <span className="video-badge" aria-label={"Video" + (p.duration ? ", " + formatDuration(p.duration) : "")}>
                  <i className="ph ph-play" />{p.duration ? formatDuration(p.duration) : ""}
                </span>
              )}
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
              {mine(p) && (
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
            {mine(p) ? (
              <Field as="textarea" rows={2} value={p.caption} placeholder="Add a description…"
                save={updatePhoto.bind(null, p.id, "caption")}
                style={{ fontSize: 12, lineHeight: 1.45, padding: "6px 8px", minHeight: 0, resize: "vertical" }} />
            ) : p.caption ? (
              <figcaption className="text-muted" style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{p.caption}</figcaption>
            ) : null}
          </figure>
        ))}
        {canUpload && (
          <form onSubmit={(e) => e.preventDefault()} style={{ aspectRatio: "4 / 3" }}>
            <label className="dashed" style={{
              display: "grid", placeItems: "center", width: "100%", height: "100%",
              gap: 6, fontSize: 12, textAlign: "center", padding: 10
            }}>
              <i className="ph ph-image-square" style={{ fontSize: 20 }} />
              {progress
                ? progress.step + (progress.total > 1 ? " " + (progress.done + 1) + " of " + progress.total : "") +
                  (progress.percent != null ? " — " + progress.percent + "%" : "…")
                : <>Add photos or videos<span className="text-muted photo-drop-tip">or drop them here · videos up to {MAX_VIDEO_SECONDS}s</span></>}
              <input hidden type="file" name="photos" accept="image/*,video/mp4,video/quicktime,video/webm,video/x-m4v,.mov,.m4v" multiple
                disabled={Boolean(progress)} onChange={onPick} />
            </label>
          </form>
        )}
      </div>
      {/* macOS Photos can't hand a browser the video itself when you drag it
          out (it uses file promises, which web pages can't accept), so the
          browser gets a still preview frame instead. */}
      {canUpload && (
        <p className="text-muted photo-drag-tip">
          <i className="ph ph-info" /> Tip: dragging a video straight out of the Photos app only sends a still image —
          drag the video file from Finder, or use <em>Add photos or videos</em>.
        </p>
      )}
      {failures.length > 0 && (
        <div role="alert" style={{ fontSize: 12, marginTop: 8, color: "var(--color-accent-300)" }}>
          {failures.length === 1 ? "1 file wasn't added:" : failures.length + " files weren't added:"}
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {failures.map((f, i) => <li key={i}><strong>{f.name}</strong> — {f.reason}</li>)}
          </ul>
        </div>
      )}
      {reorderError && <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>{reorderError}</p>}

      {open != null && shown[open] && (
        <PhotoLightbox photos={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
          onRotate={(photo, delta) => { if (mine(photo)) rotate(photo, delta); }} canRotate={mine} />
      )}
    </div>
  );
}
