"use client";

import { useState, useTransition } from "react";

// Inline edit that saves on blur (or on change for selects and dates).
export default function Field({ value, save, as = "input", type = "text", options, style, placeholder, rows }) {
  const [draft, setDraft] = useState(value ?? "");
  const [pending, start] = useTransition();
  const commit = () => { if (draft !== value) start(() => save(draft)); };
  const common = {
    className: "input",
    value: draft,
    placeholder,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    style: { opacity: pending ? 0.6 : 1, ...style }
  };

  if (as === "select") {
    return (
      <select {...common} onChange={(e) => { setDraft(e.target.value); start(() => save(e.target.value)); }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (as === "textarea") return <textarea {...common} rows={rows || 8} />;
  if (type === "date") {
    return <input {...common} type="date"
      onChange={(e) => { setDraft(e.target.value); start(() => save(e.target.value)); }} />;
  }
  return <input {...common} type={type} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
