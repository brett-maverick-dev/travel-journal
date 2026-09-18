import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import TripBrowser from "./TripBrowser";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fmtRange, TRANSPORT_ICON } from "@/lib/format";

export default async function Trips() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.verified) redirect("/verify?email=" + encodeURIComponent(user.email));

  const rows = await db.trip.findMany({
    where: { userId: user.id },
    orderBy: { startDate: "desc" },
    include: {
      destinations: { orderBy: { position: "asc" } },
      pages: { select: { id: true } }
    }
  });

  const trips = rows.map((t) => ({
    id: t.id,
    name: t.name,
    country: t.country || t.destinations[0]?.name || "",
    coverUrl: t.coverUrl,
    visibility: t.visibility,
    dateRange: fmtRange(t.startDate, t.endDate),
    href: "/trips/" + t.id,
    pageLine: t.destinations.length + " destinations · " + t.pages.length + " pages",
    stops: t.destinations.map((d) => ({
      name: d.name, lat: d.lat, lng: d.lng, icon: TRANSPORT_ICON[d.transport] || "ph-path"
    }))
  }));

  return (
    <>
      <Nav user={user} active="trips" />
      <TripBrowser trips={trips} />
    </>
  );
}
