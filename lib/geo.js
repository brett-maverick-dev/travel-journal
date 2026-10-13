import { db } from "./db.js";

// Look up coordinates for a destination name so it can be pinned on the map.
// Nominatim asks for a real User-Agent and no more than one request a second.
export async function geocode(place) {
  if (!place) return null;
  try {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(place);
    const res = await fetch(url, {
      headers: { "User-Agent": "Trekkster/0.1 (self-hosted)" },
      next: { revalidate: 86400 }
    });
    const hits = await res.json();
    if (!hits || !hits.length) return null;
    return { lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon) };
  } catch {
    return null;
  }
}

// For layovers and arrivals, where people often type an airport code: a bare
// three-letter "NRT" is looked up as "NRT airport" first (Narita Airport,
// not Narita town), then as typed. Not used for destinations, where a short
// name like "Rio" is a place, not a code.
export async function geocodeStop(place) {
  const name = String(place || "").trim();
  if (/^[A-Za-z]{3}$/.test(name)) {
    const airport = await geocode(name.toUpperCase() + " airport");
    if (airport) return airport;
  }
  return geocode(name);
}

// Trips whose departure city was saved before it had coordinates get them the
// first time they're shown on a map. Returns the trip with lat/lng filled in.
export async function withDepartureCoords(trip) {
  if (!trip.departureCity || trip.departureLat != null) return trip;
  const coords = await geocode(trip.departureCity);
  if (!coords) return trip;
  await db.trip.update({ where: { id: trip.id }, data: { departureLat: coords.lat, departureLng: coords.lng } });
  return { ...trip, departureLat: coords.lat, departureLng: coords.lng };
}
