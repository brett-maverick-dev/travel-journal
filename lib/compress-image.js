// Browser-side: shrinks a photo before it's uploaded — longest side at most
// `maxEdge`, re-encoded as JPEG. A phone photo of 5–12 MB typically comes
// out well under 1 MB. Re-encoding also drops the file's metadata (camera
// details, GPS location). Falls back to the original file whenever the
// browser can't decode it (e.g. HEIC outside Safari), it's an animated GIF,
// or the result wouldn't actually be smaller.
export async function compressImage(file, { maxEdge = 2560, quality = 0.82 } = {}) {
  if (!file || !String(file.type).startsWith("image/") || file.type === "image/gif") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // JPEG has no transparency — flatten onto white
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close?.();
  }
}

// Replaces a file input's files with compressed copies, in place, so the
// surrounding <form action> submits the smaller versions.
export async function compressInputFiles(input, options) {
  const files = [...(input.files || [])];
  if (!files.length) return;
  const smaller = await Promise.all(files.map((f) => compressImage(f, options)));
  const dt = new DataTransfer();
  smaller.forEach((f) => dt.items.add(f));
  input.files = dt.files;
}
