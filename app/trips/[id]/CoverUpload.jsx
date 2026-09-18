"use client";

import { useActionState } from "react";
import { setTripCover } from "@/app/actions";

export default function CoverUpload({ tripId, hasCover }) {
  const [state, action, pending] = useActionState(setTripCover, null);
  return (
    <form action={action}>
      <input type="hidden" name="tripId" value={tripId} />
      <label className="btn btn-secondary" style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
        <i className="ph ph-image" />
        {pending ? "Uploading…" : hasCover ? "Change cover" : "Add a cover photo"}
        <input hidden type="file" name="cover" accept="image/*"
          onChange={(e) => e.currentTarget.form.requestSubmit()} />
      </label>
      {state?.error && <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>{state.error}</span>}
    </form>
  );
}
