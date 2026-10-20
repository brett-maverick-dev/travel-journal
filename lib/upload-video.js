// Browser-side helpers for uploading a short video straight to storage.
import { VIDEO_TYPES } from "./media.js";

// The file's video MIME type — from the browser, or from its extension when
// the browser leaves it blank (it sometimes does for .mov/.m4v).
export function videoTypeOf(file) {
  if (VIDEO_TYPES[("." + String(file?.name || "").split(".").pop()).toLowerCase()] && !file.type) {
    return VIDEO_TYPES[("." + file.name.split(".").pop()).toLowerCase()];
  }
  return Object.values(VIDEO_TYPES).includes(file?.type) ? file.type : null;
}

// { duration, poster } — the clip's length in seconds and a JPEG File of a
// frame from early in it, for the grid. Either can be null: a browser that
// can't decode the clip (e.g. HEVC outside Safari) can still upload it, just
// without them.
export function probeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => done({ duration: Number.isFinite(v.duration) ? v.duration : null, poster: null }), 15000);
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onerror = () => done({ duration: null, poster: null });
    v.onloadedmetadata = () => {
      // A frame a little way in — the very first is often black.
      v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    };
    v.onseeked = () => {
      const duration = Number.isFinite(v.duration) ? v.duration : null;
      try {
        const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => done({
          duration,
          poster: blob ? new File([blob], "poster.jpg", { type: "image/jpeg" }) : null
        }), "image/jpeg", 0.82);
      } catch {
        done({ duration, poster: null });
      }
    };
    v.src = url;
  });
}

// PUTs the file to `url`, reporting progress 0–1. XMLHttpRequest rather than
// fetch because fetch can't report upload progress.
export function putWithProgress(url, file, type, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("HTTP " + xhr.status)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}
