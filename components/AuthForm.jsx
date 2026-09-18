"use client";

import { useActionState } from "react";

export default function AuthForm({ action, submitLabel, children, hint }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 360 }}>
      {children}
      {state?.error && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-300)" }}>{state.error}</p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Working…" : submitLabel}<i className="ph ph-arrow-right" />
        </button>
        {hint && <span className="text-muted" style={{ fontSize: 12 }}>{hint}</span>}
      </div>
    </form>
  );
}
