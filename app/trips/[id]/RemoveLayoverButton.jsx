"use client";

import { useTransition } from "react";
import { deleteLayover } from "@/app/actions";

export default function RemoveLayoverButton({ layoverId }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-ghost btn-icon" disabled={pending}
      title="Remove layover" aria-label="Remove layover"
      onClick={() => start(() => deleteLayover(layoverId))}
      style={{ width: 26, height: 26, color: "var(--color-neutral-500)" }}>
      <i className={pending ? "ph ph-circle-notch" : "ph ph-x"} />
    </button>
  );
}
