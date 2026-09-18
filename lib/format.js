const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const TRANSPORT = ["Flight","Train","Bus","Rental car","Ferry","On foot"];

export const TRANSPORT_ICON = {
  "Flight": "ph-airplane-tilt", "Train": "ph-train-regional", "Bus": "ph-bus",
  "Rental car": "ph-car", "Ferry": "ph-boat", "On foot": "ph-person-simple-walk"
};

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
  const n = Math.round((new Date(b) - new Date(a)) / 86400000);
  return Math.max(1, n) + (n === 1 ? " night" : " nights");
}

export function tagList(tags) {
  return (tags || "").split(",").map((t) => t.trim()).filter(Boolean);
}
