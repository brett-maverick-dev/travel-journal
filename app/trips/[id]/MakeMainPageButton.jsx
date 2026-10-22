"use client";

import { useTransition } from "react";
import { movePage } from "@/app/actions";

// On a subpage: lifts it out from under its main page — the same as dragging
// its tab onto a main page's tab, for when dragging isn't handy (touch).
export default function MakeMainPageButton({ pageId }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => start(() => movePage(pageId, null))}
      style={{ fontSize: 11, padding: "2px 8px", minHeight: 0 }}>
      <i className={pending ? "ph ph-circle-notch" : "ph ph-arrow-elbow-left-up"} />{pending ? "Moving…" : "Make it a main page"}
    </button>
  );
}
