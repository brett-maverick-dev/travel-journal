"use client";

import { useActionState } from "react";
import { uploadPhotos, deletePhoto } from "@/app/actions";

export default function Photos({ pageId, photos, canEdit }) {
  const [state, action, pending] = useActionState(uploadPhotos, null);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {photos.map((p) => (
          <figure key={p.id} style={{ position: "relative", aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 8, background: "var(--color-neutral-900)" }}>
            <img src={p.url} alt={p.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {canEdit && (
              <button className="btn btn-icon" aria-label="Remove photo"
                onClick={() => deletePhoto(p.id)}
                style={{ position: "absolute", top: 6, right: 6, background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
                <i className="ph ph-x" />
              </button>
            )}
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
              {pending ? "Uploading…" : "Add photos"}
              <input hidden type="file" name="photos" accept="image/*" multiple
                onChange={(e) => e.currentTarget.form.requestSubmit()} />
            </label>
          </form>
        )}
      </div>
      {state?.error && <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>{state.error}</p>}
    </div>
  );
}
