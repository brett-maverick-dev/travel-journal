"use client";

import { useActionState, useState, useTransition } from "react";
import { uploadPhotos, deletePhoto, updatePhoto } from "@/app/actions";
import { compressInputFiles } from "@/lib/compress-image";
import Field from "./Field";
import PhotoImage from "./PhotoImage";
import PhotoLightbox from "./PhotoLightbox";

// A page's photo grid. Click a photo to enlarge it. With canEdit: add
// photos, turn them upright (rotate left/right), remove them, and write a
// description under each; without it (the public trip view), descriptions
// are shown as text.
export default function Photos({ pageId, photos, canEdit }) {
  const [state, action, pending] = useActionState(uploadPhotos, null);
  const [shrinking, setShrinking] = useState(false);
  const [open, setOpen] = useState(null); // index of the enlarged photo
  const [turns, setTurns] = useState({}); // id → rotation, shown before the save lands
  const [, startSaving] = useTransition();

  const shown = photos.map((p) => (p.id in turns ? { ...p, rotation: turns[p.id] } : p));

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, alignItems: "start" }}>
        {shown.map((p, i) => (
          <figure key={p.id} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div className="photo-tile" role="button" tabIndex={0} aria-label={"Enlarge photo" + (p.caption ? ": " + p.caption : "")}
              onClick={() => setOpen(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(i); } }}>
              <PhotoImage photo={p} />
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

      {open != null && shown[open] && (
        <PhotoLightbox photos={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
          onRotate={canEdit ? rotate : null} />
      )}
    </div>
  );
}
