"use client";

import { useTransition } from "react";
import { adminSetVerified, adminSetAdmin, adminDeleteUser } from "@/app/actions";

export default function UserActions({ userId, verified, isAdmin, isSelf }) {
  const [pending, start] = useTransition();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: pending ? 0.5 : 1 }}>
      <button className={"tag " + (verified ? "tag-accent" : "tag-neutral")} disabled={pending}
        onClick={() => start(() => adminSetVerified(userId, !verified))}
        title="Toggle verified" style={{ cursor: "pointer", border: 0 }}>
        {verified ? "Verified" : "Unverified"}
      </button>
      <button className={"tag " + (isAdmin ? "tag-accent-2" : "tag-neutral")} disabled={pending || isSelf}
        onClick={() => start(async () => {
          const res = await adminSetAdmin(userId, !isAdmin);
          if (res?.error) alert(res.error);
        })}
        title={isSelf ? "You can't change your own admin status" : "Toggle admin"}
        style={{ cursor: isSelf ? "not-allowed" : "pointer", border: 0, opacity: isSelf ? 0.5 : 1 }}>
        {isAdmin ? "Admin" : "User"}
      </button>
      <button className="btn btn-ghost btn-icon" disabled={pending || isSelf}
        title={isSelf ? "You can't delete your own account here" : "Delete user"}
        onClick={() => {
          if (confirm("Delete this user and everything they created? This can't be undone.")) {
            start(async () => {
              const res = await adminDeleteUser(userId);
              if (res?.error) alert(res.error);
            });
          }
        }}>
        <i className={pending ? "ph ph-circle-notch" : "ph ph-trash"} />
      </button>
    </div>
  );
}
