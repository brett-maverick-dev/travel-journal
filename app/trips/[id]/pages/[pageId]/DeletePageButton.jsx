"use client";

import { useTransition } from "react";
import { deletePage } from "@/app/actions";

export default function DeletePageButton({ pageId }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-secondary" disabled={pending}
      onClick={() => { if (confirm("Delete this page?")) start(() => deletePage(pageId)); }}>
      <i className="ph ph-trash" />{pending ? "Deleting…" : "Delete page"}
    </button>
  );
}
