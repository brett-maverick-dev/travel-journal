"use client";

import { useRouter } from "next/navigation";

// Switches the trip page between editing and Reader view, keeping whichever
// destination and page are open (TripJournal keeps those in the URL).
export default function ViewToggle({ reading }) {
  const router = useRouter();
  const toggle = () => {
    const url = new URL(window.location.href);
    if (reading) url.searchParams.delete("view"); else url.searchParams.set("view", "read");
    router.push(url.pathname + url.search);
  };
  return (
    <button type="button" className="btn btn-secondary" onClick={toggle}
      style={{ background: "color-mix(in srgb, var(--color-bg) 70%, transparent)" }}
      title={reading ? "Back to editing" : "See the trip as the people you share it with do"}>
      <i className={"ph " + (reading ? "ph-pencil-simple" : "ph-book-open")} />{reading ? "Edit" : "Reader view"}
    </button>
  );
}
