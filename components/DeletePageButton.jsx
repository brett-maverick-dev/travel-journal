"use client";

import { useTransition } from "react";
import { deletePage } from "@/app/actions";

export default function DeletePageButton({ pageId, confirmLabel = "this page", compact = false, style }) {
  const [pending, start] = useTransition();
  const onClick = () => {
    if (confirm("Delete " + confirmLabel + "?")) start(() => deletePage(pageId));
  };

  if (compact) {
    return (
      <button className="btn btn-ghost btn-icon" disabled={pending} onClick={onClick}
        title="Delete page" style={style}>
        <i className={pending ? "ph ph-circle-notch" : "ph ph-trash"} />
      </button>
    );
  }
  return (
    <button className="btn btn-secondary" disabled={pending} onClick={onClick} style={style}>
      <i className="ph ph-trash" />{pending ? "Deleting…" : "Delete page"}
    </button>
  );
}
