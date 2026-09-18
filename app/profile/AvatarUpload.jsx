"use client";

import { useActionState } from "react";
import { setAvatar } from "@/app/actions";

export default function AvatarUpload({ avatarUrl, initials }) {
  const [state, action, pending] = useActionState(setAvatar, null);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <label style={{ position: "relative", display: "block", cursor: "pointer", width: 96, height: 96 }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", opacity: pending ? 0.6 : 1 }} />
          : (
            <div style={{
              width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center",
              background: "var(--color-accent-800)", color: "var(--color-accent-100)", fontSize: 28,
              opacity: pending ? 0.6 : 1
            }}>{initials}</div>
          )}
        <span className="btn btn-secondary btn-icon" style={{
          position: "absolute", bottom: -2, right: -2, background: "var(--color-bg)"
        }}>
          <i className={pending ? "ph ph-circle-notch" : "ph ph-camera"} />
        </span>
        <input hidden type="file" name="avatar" accept="image/*"
          onChange={(e) => e.currentTarget.form.requestSubmit()} />
      </label>
      {state?.error && <span className="text-muted" style={{ fontSize: 11 }}>{state.error}</span>}
    </form>
  );
}
