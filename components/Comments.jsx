"use client";

import { useRef, useState, useTransition } from "react";
import { addComment, deleteComment } from "@/app/actions";

// A page's comment thread, for everyone on the trip (any access level).
// Delete your own; canModerate (Full access / owner) deletes anyone's.
//
//   comments: [{ id, body, createdAt, userId, user: { name, handle, avatarUrl } }]
export default function Comments({ pageId, comments, meId, canModerate }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const box = useRef(null);

  const post = (e) => {
    e.preventDefault();
    const body = box.current.value.trim();
    if (!body) return;
    start(async () => {
      const res = await addComment(pageId, body);
      if (res?.error) setError(res.error);
      else { setError(""); box.current.value = ""; }
    });
  };
  const remove = (id) => {
    if (!confirm("Delete this comment?")) return;
    start(() => deleteComment(id));
  };

  return (
    <section aria-label="Comments" style={{ display: "flex", flexDirection: "column", gap: 12, opacity: pending ? 0.75 : 1 }}>
      <h6 className="text-muted" style={{ margin: 0 }}>
        Comments{comments.length ? " (" + comments.length + ")" : ""}
      </h6>

      {comments.map((c) => (
        <div key={c.id} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 10, alignItems: "start" }}>
          <span style={{
            width: 28, height: 28, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
            fontSize: 10, background: "var(--color-accent-800)", color: "var(--color-accent-100)"
          }}>
            {c.user.avatarUrl
              ? <img src={c.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : (c.user.name || c.user.handle || "?").slice(0, 2).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{c.user.name || "@" + c.user.handle}</span>
              {" "}
              {/* Shown in the reader's own time zone; the server can't know it. */}
              <time className="text-muted" dateTime={new Date(c.createdAt).toISOString()} suppressHydrationWarning style={{ fontSize: 11 }}>
                {new Date(c.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.body}</div>
          </div>
          {(c.userId === meId || canModerate) && (
            <button type="button" className="btn btn-ghost btn-icon" disabled={pending} onClick={() => remove(c.id)}
              title="Delete comment" aria-label="Delete comment" style={{ width: 26, height: 26, color: "var(--color-neutral-500)" }}>
              <i className="ph ph-trash" />
            </button>
          )}
        </div>
      ))}

      <form onSubmit={post} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea ref={box} className="input" rows={2} maxLength={4000} placeholder="Add a comment…" aria-label="Add a comment"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(e); }}
          style={{ flex: 1, fontSize: 13, lineHeight: 1.45, padding: "8px 10px", resize: "vertical" }} />
        <button type="submit" className="btn btn-secondary" disabled={pending}>{pending ? "Posting…" : "Post"}</button>
      </form>
      {error && <p style={{ margin: 0, fontSize: 12, color: "var(--color-accent-300)" }}>{error}</p>}
    </section>
  );
}
