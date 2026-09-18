import Link from "next/link";
import { signOut } from "@/app/actions";

export default function Nav({ user, active }) {
  const email = user?.email || "";
  const avatarUrl = user?.avatarUrl;
  return (
    <div className="nav" style={{
      padding: "14px 34px", position: "sticky", top: 0, zIndex: 20,
      background: "color-mix(in srgb, var(--color-bg) 88%, transparent)",
      backdropFilter: "blur(8px)", borderBottom: "1px solid var(--color-divider)"
    }}>
      <Link href="/trips" className="nav-brand" style={{
        display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none"
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: "var(--color-accent)",
          boxShadow: "0 0 10px var(--color-accent)"
        }} />
        Meridian
      </Link>
      <Link href="/trips" aria-current={active === "trips" ? "page" : undefined}>Trips</Link>
      <Link href="/trips#map">Map</Link>
      <Link href="/profile" aria-current={active === "profile" ? "page" : undefined}>Profile</Link>
      <form action={signOut}>
        <button className="btn btn-secondary" type="submit">Sign out</button>
      </form>
      <Link href="/profile" title={email} style={{
        width: 30, height: 30, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
        fontSize: 11, background: "var(--color-accent-800)", color: "var(--color-accent-100)"
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : (email || "me").slice(0, 2).toUpperCase()}
      </Link>
    </div>
  );
}
