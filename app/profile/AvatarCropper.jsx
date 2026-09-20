"use client";

import { useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 480; // exported image resolution
const PREVIEW_SIZE = 220; // on-screen circular preview diameter

// Drag to reposition, a slider to zoom, exported at a fixed square resolution
// via canvas so what you see here is exactly what gets saved — the preview is
// the same canvas-space math rendered at a smaller CSS scale, not a separate
// approximation.
export default function AvatarCropper({ file, onCancel, onSave }) {
  const [url, setUrl] = useState("");
  const [natural, setNatural] = useState(null); // { width, height }
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null); // { startX, startY, originX, originY } while dragging

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    const img = new Image();
    img.onload = () => setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!natural) return null;

  const baseScale = Math.max(CANVAS_SIZE / natural.width, CANVAS_SIZE / natural.height);
  const scale = baseScale * zoom;
  const dispW = natural.width * scale;
  const dispH = natural.height * scale;
  const maxOffsetX = Math.max(0, (dispW - CANVAS_SIZE) / 2);
  const maxOffsetY = Math.max(0, (dispH - CANVAS_SIZE) / 2);

  const clamp = (pos) => ({
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, pos.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, pos.y))
  });

  const onPointerDown = (e) => {
    // Capture keeps the drag going if the pointer leaves the circle mid-drag;
    // don't let a capture failure (some browsers reject it for odd pointer
    // ids) stop the drag from starting at all.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const scaleUp = CANVAS_SIZE / PREVIEW_SIZE;
    const dx = (e.clientX - dragRef.current.startX) * scaleUp;
    const dy = (e.clientY - dragRef.current.startY) * scaleUp;
    setOffset(clamp({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onZoom = (e) => {
    const z = Number(e.target.value);
    setZoom(z);
    // re-clamp with the new scale so a zoom-out never leaves the image
    // hanging off-frame
    const s = baseScale * z;
    const w = natural.width * s, h = natural.height * s;
    const mx = Math.max(0, (w - CANVAS_SIZE) / 2), my = Math.max(0, (h - CANVAS_SIZE) / 2);
    setOffset((o) => ({
      x: Math.min(mx, Math.max(-mx, o.x)),
      y: Math.min(my, Math.max(-my, o.y))
    }));
  };

  const save = () => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, CANVAS_SIZE / 2 - dispW / 2 + offset.x, CANVAS_SIZE / 2 - dispH / 2 + offset.y, dispW, dispH);
      canvas.toBlob((blob) => { if (blob) onSave(blob); }, "image/jpeg", 0.92);
    };
    img.src = url;
  };

  return (
    <div className="dialog-backdrop" style={{ zIndex: 2000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog" style={{ width: "min(360px, 100%)", alignItems: "center" }}>
        <div className="dialog-title" style={{ alignSelf: "flex-start" }}>Reposition your photo</div>

        <div
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={{
            width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: "50%", overflow: "hidden",
            position: "relative", cursor: "grab", touchAction: "none",
            background: "var(--color-neutral-900)", boxShadow: "0 0 0 1px var(--color-divider)"
          }}>
          <div style={{
            position: "relative", width: CANVAS_SIZE, height: CANVAS_SIZE,
            transform: "scale(" + (PREVIEW_SIZE / CANVAS_SIZE) + ")", transformOrigin: "top left"
          }}>
            <img src={url} alt="" draggable={false} style={{
              position: "absolute", width: dispW, height: dispH,
              left: CANVAS_SIZE / 2 - dispW / 2 + offset.x,
              top: CANVAS_SIZE / 2 - dispH / 2 + offset.y,
              userSelect: "none", pointerEvents: "none"
            }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <i className="ph ph-magnifying-glass" style={{ color: "var(--color-neutral-400)" }} />
          <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={onZoom} style={{ flex: 1 }} />
        </div>
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Drag the photo to reposition it.</p>

        <div className="dialog-actions" style={{ width: "100%" }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save photo</button>
        </div>
      </div>
    </div>
  );
}
