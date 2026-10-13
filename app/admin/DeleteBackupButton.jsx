"use client";

import { useTransition } from "react";
import { adminDeleteBackup } from "@/app/actions";

export default function DeleteBackupButton({ name }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-ghost btn-icon" disabled={pending} title="Delete backup" aria-label={"Delete " + name}
      onClick={() => {
        if (!confirm("Delete the backup " + name + "? This can't be undone.")) return;
        start(async () => {
          const res = await adminDeleteBackup(name);
          if (res?.error) alert(res.error);
        });
      }}>
      <i className={pending ? "ph ph-circle-notch" : "ph ph-trash"} />
    </button>
  );
}
