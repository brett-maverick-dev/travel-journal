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
  const n = Math.round((new Date(b) - new Date(a)) / 86400000);
  return Math.max(1, n) + (n === 1 ? " night" : " nights");
}

export function tagList(tags) {
  return (tags || "").split(",").map((t) => t.trim()).filter(Boolean);
}
