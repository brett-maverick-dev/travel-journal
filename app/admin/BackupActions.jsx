"use client";

import { useTransition } from "react";
import { adminCreateBackup } from "@/app/actions";

export default function BackupActions() {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-primary" disabled={pending}
      onClick={() => start(() => adminCreateBackup())}>
      <i className={pending ? "ph ph-circle-notch" : "ph ph-database"} />
      {pending ? "Snapshotting…" : "Create backup now"}
    </button>
  );
}
