import { notFound } from "next/navigation";
import Link from "next/link";
import TripMap from "@/components/TripMap";
import { db } from "@/lib/db";
import { fmtRange, SOCIALS } from "@/lib/format";

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle } });
  return { title: user ? (user.name || "@" + user.handle) + " — Trekkster" : "Trekkster" };
}

// Public, read-only — no auth required. Shows whatever the account holder
// filled in on their profile, plus their public trips.
export default async function PublicProfile({ params }) {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle } });
  if (!user || !user.verified) notFound();

  const trips = await db.trip.findMany({
    where: { userId: user.id, visibility: "PUBLIC" },
    orderBy: { startDate: "desc" },
    include: { destinations: { orderBy: { position: "asc" } } }
  });

  const initials = (user.name || user.handle || "?").slice(0, 2).toUpperCase();
  const socials = SOCIALS.filter((s) => user[s.field]);
  const mapTrips = trips.map((t) => ({
    id: t.id, name: t.name, country: t.country, coverUrl: t.coverUrl,
    dateRange: fmtRange(t.startDate, t.endDate), href: "/u/" + user.handle + "/" + t.id,
    stops: t.destinations.map((d) => ({ name: d.name, lat: d.lat, lng: d.lng }))
  }));

  return (
    <div className="page-shell" style={{ maxWidth: 720, paddingTop: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 8 }}>
        <span style={{
          width: 84, height: 84, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
          fontSize: 26, background: "var(--color-accent-800)", color: "var(--color-accent-100)", flexShrink: 0
        }}>
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: "0 0 2px", fontSize: 30 }}>{user.name || "@" + user.handle}</h1>
          <div className="text-muted" style={{ fontSize: 14 }}>@{user.handle}</div>
          {(user.homeCity || user.favoritePlace) && (
            <div className="text-muted" style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
              {user.homeCity && <span><i className="ph ph-house-line" style={{ marginRight: 4 }} />{user.homeCity}</span>}
              {user.favoritePlace && <span><i className="ph ph-heart" style={{ marginRight: 4 }} />{user.favoritePlace}</span>}
            </div>
          )}
        </div>
      </div>

      {user.bio && <p style={{ fontSize: 15, lineHeight: 1.6, maxWidth: "60ch", margin: "16px 0" }}>{user.bio}</p>}

      {socials.length > 0 && (
        <div style={{ display: "flex", gap: 14, margin: "16px 0" }}>
          {socials.map((s) => (
            <a key={s.field} href={user[s.field]} target="_blank" rel="noopener noreferrer nofollow"
              title={s.label} style={{ color: "var(--color-accent)", fontSize: 20 }}>
              <i className={"ph " + s.icon} />
            </a>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: "var(--color-divider)", margin: "26px 0" }} />

      <h6 className="text-muted" style={{ margin: "0 0 14px" }}>
        {trips.length} public {trips.length === 1 ? "trip" : "trips"}
      </h6>

      {trips.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 14 }}>No public trips yet.</p>
      ) : (
        <>
          <TripMap trips={mapTrips} height={220} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 16 }}>
            {trips.map((t) => (
              <Link key={t.id} href={"/u/" + user.handle + "/" + t.id} className="trip-card card elev-sm"
                style={{ padding: 14, gap: 6, textDecoration: "none", color: "inherit" }}>
                <div className="card-kicker">{t.country || t.destinations[0]?.name}</div>
                <div className="card-title" style={{ fontSize: 16 }}>{t.name}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{fmtRange(t.startDate, t.endDate)}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="text-muted" style={{ fontSize: 12, marginTop: 40 }}>
        Kept in Trekkster. <Link href="/signup">Start your own journal</Link>.
      </p>
    </div>
  );
}
