"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribe, getSnapshot, getServerSnapshot, retryFailed } from "@/lib/save-status";

// A small pill in the corner saying what's happening to your edits: saving,
// saved (briefly), or not saved — kept on this device and being retried.
export default function SaveStatus() {
  const { state, savedAt } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!savedAt || state !== "idle") return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2200);
    return () => clearTimeout(t);
  }, [savedAt, state]);

  const content = state === "saving" ? (
    <><i className="ph ph-circle-notch save-spin" />Saving…</>
  ) : state === "error" ? (
    <>
      <i className="ph ph-cloud-slash" style={{ color: "var(--color-accent-300)" }} />
      <span>Not saved yet — kept on this device, retrying</span>
      <button type="button" className="save-status-retry" onClick={retryFailed}>Retry now</button>
    </>
  ) : state === "idle" && showSaved ? (
    <><i className="ph ph-check" style={{ color: "var(--color-accent)" }} />Saved</>
  ) : null;

  return (
    <div className="save-status" role="status" aria-live="polite" data-state={content ? state : "hidden"}>
      {content}
    </div>
  );
}
