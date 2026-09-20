"use client";

import { useActionState, useRef, useState } from "react";
import { setAvatar } from "@/app/actions";
import AvatarCropper from "./AvatarCropper";

export default function AvatarUpload({ avatarUrl, initials }) {
  const [state, action, pending] = useActionState(setAvatar, null);
  const [pickedFile, setPickedFile] = useState(null);
  const formRef = useRef(null);
  const inputRef = useRef(null);

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) setPickedFile(file);
    e.target.value = ""; // so picking the same file again still fires onChange
  };

  const onCropSave = (blob) => {
    const cropped = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(cropped);
    inputRef.current.files = dt.files;
    setPickedFile(null);
    formRef.current.requestSubmit();
  };

  return (
    <form ref={formRef} action={action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
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
        <input ref={inputRef} hidden type="file" name="avatar" accept="image/*" onChange={onPick} />
      </label>
      {state?.error && <span className="text-muted" style={{ fontSize: 11 }}>{state.error}</span>}

      {pickedFile && (
        <AvatarCropper file={pickedFile} onCancel={() => setPickedFile(null)} onSave={onCropSave} />
      )}
    </form>
  );
}
