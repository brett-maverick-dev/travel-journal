const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const TRANSPORT = ["Flight","Train","Bus","Rental car","Ferry","On foot"];

export const TRANSPORT_ICON = {
  "Flight": "ph-airplane-tilt", "Train": "ph-train-regional", "Bus": "ph-bus",
  "Rental car": "ph-car", "Ferry": "ph-boat", "On foot": "ph-person-simple-walk"
};

export const SOCIALS = [
  { field: "facebookUrl", icon: "ph-facebook-logo", label: "Facebook", placeholder: "https://facebook.com/yourname" },
  { field: "instagramUrl", icon: "ph-instagram-logo", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
  { field: "tiktokUrl", icon: "ph-tiktok-logo", label: "TikTok", placeholder: "https://tiktok.com/@yourhandle" },
  { field: "xUrl", icon: "ph-x-logo", label: "X", placeholder: "https://x.com/yourhandle" },
  { field: "youtubeUrl", icon: "ph-youtube-logo", label: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
  { field: "pinterestUrl", icon: "ph-pinterest-logo", label: "Pinterest", placeholder: "https://pinterest.com/yourhandle" }
];

export function fmt(date) {
  const d = new Date(date);
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
}

export function fmtRange(a, b) {
  const ya = new Date(a).getUTCFullYear(), yb = new Date(b).getUTCFullYear();
  return fmt(a) + " – " + fmt(b) + " " + (ya === yb ? ya : ya + "/" + yb);
}

export function inputDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function nights(a, b) {
  const n = Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));
  return n + (n === 1 ? " night" : " nights");
}

export function tagList(tags) {
  return (tags || "").split(",").map((t) => t.trim()).filter(Boolean);
}

// Map pins for a trip, in route order: the journey there (departure city,
// its layovers, where it lands), every destination, then the journey home
// (where it leaves from, its layovers, home). Journey stops appear only once
// they have a location, each with a `kind` so the map can draw it differently.
export function mapStops(trip, extra = () => ({})) {
  const located = (s) => s.name && s.lat != null && s.lng != null;
  const layovers = (leg) => (trip.layovers || [])
    .filter((l) => (l.leg || "DEPARTURE") === leg)
    .map((l) => ({ name: l.name, lat: l.lat, lng: l.lng, kind: "layover" }));
  const there = [
    { name: trip.departureCity, lat: trip.departureLat, lng: trip.departureLng, kind: "departure" },
    ...layovers("DEPARTURE"),
    { name: trip.arrivalCity, lat: trip.arrivalLat, lng: trip.arrivalLng, kind: "arrival" }
  ].filter(located);
  const home = [
    { name: trip.returnFromCity, lat: trip.returnFromLat, lng: trip.returnFromLng, kind: "return" },
    ...layovers("RETURN"),
    { name: trip.returnToCity, lat: trip.returnToLat, lng: trip.returnToLng, kind: "home" }
  ].filter(located);
  const destinations = (trip.destinations || []).map((d) => ({ name: d.name, lat: d.lat, lng: d.lng, ...extra(d) }));
  return [...there, ...destinations, ...home];
}

// A cover photo's saved framing as styles for an <img> that fills its box:
// object-fit/-position place the focus point, and the zoom scales about it.
export function coverFrame(trip) {
  const zoom = Math.min(3, Math.max(1, Number(trip?.coverZoom) || 1));
  const x = Math.min(100, Math.max(0, Number(trip?.coverX ?? 50)));
  const y = Math.min(100, Math.max(0, Number(trip?.coverY ?? 50)));
  return { zoom, x, y };
}

export function coverStyle(trip) {
  const { zoom, x, y } = coverFrame(trip);
  return {
    width: "100%", height: "100%", objectFit: "cover",
    objectPosition: x + "% " + y + "%",
    transform: zoom === 1 ? undefined : "scale(" + zoom + ")",
    transformOrigin: x + "% " + y + "%"
  };
}
