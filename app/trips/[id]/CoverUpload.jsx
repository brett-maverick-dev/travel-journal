"use client";

import { useActionState, useState } from "react";
import { setTripCover } from "@/app/actions";
import { compressInputFiles } from "@/lib/compress-image";

export default function CoverUpload({ tripId, hasCover }) {
  const [state, action, pending] = useActionState(setTripCover, null);
  const [shrinking, setShrinking] = useState(false);
  const onPick = async (e) => {
    const input = e.currentTarget;
    setShrinking(true);
    try { await compressInputFiles(input); } finally { setShrinking(false); }
    input.form.requestSubmit();
  };
  return (
    <form action={action}>
      <input type="hidden" name="tripId" value={tripId} />
      <label className="btn btn-secondary" style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}>
        <i className="ph ph-image" />
        {shrinking ? "Optimising…" : pending ? "Uploading…" : hasCover ? "Change cover" : "Add a cover photo"}
        <input hidden type="file" name="cover" accept="image/*" onChange={onPick} />
      </label>
      {state?.error && <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>{state.error}</span>}
    </form>
  );
}
