import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import TripMap from "@/components/TripMap";
import { signUp } from "@/app/actions";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fmtRange } from "@/lib/format";

// The signup screen is the site root so platform health checks get a 200 here
// rather than following a redirect.
export default async function Home() {
  const user = await currentUser();
  if (user?.verified) redirect("/trips");

  let trips = [];
  try {
    const rows = await db.trip.findMany({
      where: { visibility: "PUBLIC" },
      include: { destinations: { orderBy: { position: "asc" } }, user: true },
      take: 24
    });
    trips = rows.map((t) => ({
      id: t.id, name: t.name, country: t.country, coverUrl: t.coverUrl,
      dateRange: fmtRange(t.startDate, t.endDate),
      href: "/u/" + t.user.handle + "/" + t.id,
      stops: t.destinations.map((d) => ({ name: d.name, lat: d.lat, lng: d.lng }))
    }));
  } catch {
    // First boot before the schema is applied: still render, just with an empty map.
    trips = [];
  }

  return (
    <div className="split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", minHeight: "100vh" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 72px", maxWidth: 620 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 48 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 17 }}>Trekkster</span>
        </div>
        <h1 style={{ fontSize: 44, margin: "0 0 14px", maxWidth: "11ch" }}>A journal that keeps its own map.</h1>
        <p className="text-muted" style={{ fontSize: 15, maxWidth: "44ch", marginBottom: 34 }}>
          Write a page for every day, break out the days worth their own story, and watch the pins
          fill in. Trips stay private until you say otherwise.
        </p>
        <AuthForm action={signUp} submitLabel="Create account" hint="We send a six-digit code to confirm it.">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" placeholder="At least 10 characters" required minLength={10} />
          </div>
        </AuthForm>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 14 }}>
          Already have an account? <Link href="/signin">Sign in</Link>
        </div>
      </div>
      <div style={{ position: "relative", borderLeft: "1px solid var(--color-divider)" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <TripMap trips={trips} height="100%" />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, var(--color-bg), transparent 38%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", left: 28, bottom: 28, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 45%, transparent)", pointerEvents: "none" }}>
          Public trips
        </div>
      </div>
    </div>
  );
}
