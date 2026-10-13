"use client";

import { useEffect, useRef, useState, useTransition } from "react";

// Inline edit that saves on blur (or on change for selects and dates).
// A save action may return { error } to refuse a value; the field then reverts
// and shows the message as a native validation bubble.
export default function Field({ value, save, as = "input", type = "text", options, style, placeholder, rows }) {
  const [draft, setDraft] = useState(value ?? "");
  const [pending, start] = useTransition();
  const ref = useRef(null);

  // Pick up the server's copy after a revalidate — e.g. a blank trip name that
  // was saved as "Untitled trip", or a value a collaborator changed.
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const run = (next) => start(async () => {
    const res = await save(next);
    const el = ref.current;
    if (res?.error) {
      setDraft(value ?? "");
      if (el) { el.setCustomValidity(res.error); el.reportValidity(); }
    } else if (el) {
      el.setCustomValidity("");
    }
  });
  const commit = () => { if (draft !== (value ?? "")) run(draft); };
  const common = {
    ref,
    className: "input",
    value: draft,
    placeholder,
    onChange: (e) => { e.target.setCustomValidity(""); setDraft(e.target.value); },
    onBlur: commit,
    style: { opacity: pending ? 0.6 : 1, ...style }
  };

  if (as === "select") {
    return (
      <select {...common} onBlur={undefined} onChange={(e) => { setDraft(e.target.value); run(e.target.value); }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (as === "textarea") return <textarea {...common} rows={rows || 8} />;
  if (type === "date") {
    // Clearing a date input (or typing through a half-entered one) reports "" —
    // keep that local instead of trying to save an empty date.
    return <input {...common} type="date" onBlur={() => { if (!draft) setDraft(value ?? ""); }}
      onChange={(e) => { setDraft(e.target.value); if (e.target.value) run(e.target.value); }} />;
  }
  return <input {...common} type={type} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
