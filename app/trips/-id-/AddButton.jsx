"use client";

import { useTransition } from "react";

export default function AddButton({ action, label, style }) {
  const [pending, start] = useTransition();
  return (
    <button className="dashed" disabled={pending} onClick={() => start(() => action())}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", ...style }}>
      <i className={pending ? "ph ph-circle-notch" : "ph ph-plus"} />{pending ? "Adding…" : label}
    </button>
  );
}
