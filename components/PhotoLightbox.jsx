"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The enlarged photo, fitted to the window *after* its rotation. A rotated
// element keeps its unrotated layout box, so a sideways photo would spill
// over the description below; instead this sizes a box to the turned photo
// (from its natural size) and rotates the <img> inside it.
function FittedPhoto({ photo }) {
  const [natural, setNatural] = useState(null);
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const rotation = ((Number(photo.rotation) || 0) % 360 + 360) % 360;
  const sideways = rotation === 90 || rotation === 270;
  const onLoad = (e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });

  if (!natural) {
    // Measure first; nothing shown until the size is known.
    return <img src={photo.url} alt="" onLoad={onLoad} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />;
  }
  const turnedW = sideways ? natural.h : natural.w, turnedH = sideways ? natural.w : natural.h;
  const scale = Math.min(1, (view.w * 0.88) / turnedW, (view.h * 0.76) / turnedH);
  const boxW = Math.round(turnedW * scale), boxH = Math.round(turnedH * scale);

  return (
    <div style={{ position: "relative", width: boxW, height: boxH }}>
      <img src={photo.url} alt={photo.caption || ""} draggable={false} style={{
        position: "absolute", left: "50%", top: "50%", borderRadius: 6,
        // laid out unrotated (so wider than its box when sideways) — opt out
        // of the global img { max-width: 100% }
        maxWidth: "none",
        width: sideways ? boxH : boxW, height: sideways ? boxW : boxH,
        transform: "translate(-50%, -50%)" + (rotation ? " rotate(" + rotation + "deg)" : ""),
        transition: "transform .2s ease"
      }} />
    </div>
  );
}

// The enlarged view of one of a page's photos, with its description and
// previous/next. Rendered into <body>: the page carousel animates with a
// transform, which would otherwise trap position:fixed inside it.
export default function PhotoLightbox({ photos, index, onIndex, onClose, onRotate }) {
  const photo = photos[index];
  const go = (step) => onIndex((index + step + photos.length) % photos.length);

  useEffect(() => {
    // Capture phase, and stop it there: while this is open the arrow keys
    // belong to the photos, not to the page carousel underneath.
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && photos.length > 1) go(1);
      else if (e.key === "ArrowLeft" && photos.length > 1) go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  });

  // Swipe left/right between photos on touch screens.
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    const t = touch.current;
    touch.current = null;
    if (!t || photos.length < 2) return;
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  if (!photo) return null;
  const control = { background: "rgba(22,24,38,.7)", color: "#e9e9ed" };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photo" className="lightbox"
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button type="button" className="btn btn-icon lightbox-close" aria-label="Close" onClick={onClose} style={control}>
        <i className="ph ph-x" />
      </button>

      {photos.length > 1 && (
        <>
          <button type="button" className="btn btn-icon lightbox-nav" style={{ ...control, left: 18 }}
            aria-label="Previous photo" onClick={() => go(-1)}>
            <i className="ph ph-caret-left" />
          </button>
          <button type="button" className="btn btn-icon lightbox-nav" style={{ ...control, right: 18 }}
            aria-label="Next photo" onClick={() => go(1)}>
            <i className="ph ph-caret-right" />
          </button>
        </>
      )}

      <figure style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: "92vw" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <FittedPhoto key={photo.id} photo={photo} />
        <figcaption style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: "min(720px, 88vw)", color: "#e9e9ed", fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap" }}>
            {photo.caption || <span style={{ opacity: 0.55 }}>No description</span>}
          </span>
          {photos.length > 1 && <span style={{ opacity: 0.55, fontSize: 12, whiteSpace: "nowrap" }}>{index + 1} / {photos.length}</span>}
          {onRotate && (
            <span style={{ display: "inline-flex", gap: 4 }}>
              <button type="button" className="btn btn-icon" style={control} aria-label="Rotate left"
                title="Rotate left" onClick={() => onRotate(photo, -90)}><i className="ph ph-arrow-counter-clockwise" /></button>
              <button type="button" className="btn btn-icon" style={control} aria-label="Rotate right"
                title="Rotate right" onClick={() => onRotate(photo, 90)}><i className="ph ph-arrow-clockwise" /></button>
            </span>
          )}
        </figcaption>
      </figure>
    </div>,
    document.body
  );
}
