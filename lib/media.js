// What can be uploaded to a trip page besides photos, and the limits —
// shared by the browser (to refuse early) and the server (to enforce).
export const VIDEO_TYPES = {
  ".mp4": "video/mp4", ".m4v": "video/x-m4v", ".mov": "video/quicktime", ".webm": "video/webm"
};
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;

export function videoExtension(mime) {
  const type = String(mime || "").toLowerCase().split(";")[0].trim();
  return Object.keys(VIDEO_TYPES).find((ext) => VIDEO_TYPES[ext] === type) || null;
}

export function isVideoFile(file) {
  return Boolean(videoExtension(file?.type));
}

// 75 → "1:15"
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
