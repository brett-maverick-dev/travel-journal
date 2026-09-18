import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40, textAlign: "center" }}>
      <div>
        <div className="card-kicker">404</div>
        <h2 style={{ margin: "6px 0 10px" }}>Nothing here</h2>
        <p className="text-muted" style={{ fontSize: 14 }}>
          This page is private, moved, or never existed.
        </p>
        <Link href="/trips" className="btn btn-primary">Back to your trips</Link>
      </div>
    </div>
  );
}
