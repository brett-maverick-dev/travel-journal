import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import TripBrowser from "./TripBrowser";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fmtRange, mapStops, TRANSPORT_ICON, coverFrame } from "@/lib/format";
import { withDepartureCoords } from "@/lib/geo";
import { ROLE_LABEL, normalizeRole } from "@/lib/permissions";

export default async function Trips() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.verified) redirect("/verify?email=" + encodeURIComponent(user.email));

  const rows = await db.trip.findMany({
    where: { OR: [{ userId: user.id }, { buddies: { some: { userId: user.id } } }] },
    orderBy: { startDate: "desc" },
    include: {
      user: true,
      buddies: { select: { userId: true, role: true } },
      destinations: { orderBy: { position: "asc" } },
      layovers: { orderBy: { position: "asc" } },
      pages: { select: { id: true } }
    }
  });

  const located = [];
  for (const t of rows) located.push(await withDepartureCoords(t)); // one lookup at a time — Nominatim's rule
  const trips = located.map((t) => ({
    id: t.id,
    name: t.name,
    country: t.country || t.destinations[0]?.name || "",
    coverUrl: t.coverUrl,
    coverFrame: coverFrame(t),
    visibility: t.visibility,
    dateRange: fmtRange(t.startDate, t.endDate),
    href: "/trips/" + t.id,
    pageLine: t.destinations.length + " destinations · " + t.pages.length + " pages",
    sharedBy: t.userId === user.id ? null : t.user.handle,
    myRole: t.userId === user.id ? null : ROLE_LABEL[normalizeRole(t.buddies.find((b) => b.userId === user.id)?.role)],
    stops: mapStops(t, (d) => ({ icon: TRANSPORT_ICON[d.transport] || "ph-path" }))
  }));

  return (
    <>
      <Nav user={user} active="trips" />
      <TripBrowser trips={trips} />
    </>
  );
}
