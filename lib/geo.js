// Look up coordinates for a destination name so it can be pinned on the map.
// Nominatim asks for a real User-Agent and no more than one request a second.
export async function geocode(place) {
  if (!place) return null;
  try {
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(place);
    const res = await fetch(url, {
      headers: { "User-Agent": "MeridianJournal/0.1 (self-hosted)" },
      next: { revalidate: 86400 }
    });
    const hits = await res.json();
    if (!hits || !hits.length) return null;
    return { lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon) };
  } catch {
    return null;
  }
}
