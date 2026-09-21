import Link from "next/link";
import BuddyActions from "./BuddyActions";

export default function UserRow({ user, relation, me }) {
  const status = relation?.status;
  const isRequester = relation?.requesterId === me;
  const initials = (user.name || user.handle || "?").slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
      <Link href={"/u/" + user.handle} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, color: "inherit", textDecoration: "none" }}>
        <span style={{
          width: 34, height: 34, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
          fontSize: 11, background: "var(--color-accent-800)", color: "var(--color-accent-100)", flexShrink: 0
        }}>
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{user.name || user.handle}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>@{user.handle}</div>
        </div>
      </Link>
      <BuddyActions targetId={user.id} status={status} isRequester={isRequester} rowId={relation?.id} />
    </div>
  );
}
