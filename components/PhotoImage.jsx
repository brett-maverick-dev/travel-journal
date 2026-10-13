// A photo turned upright by its saved rotation (0/90/180/270 clockwise),
// filling a box of the given aspect ratio (width / height) — the 4:3 grid
// tiles. A sideways turn swaps the image's width and height, so the <img> is
// laid out with the box's dimensions swapped, then rotated back into place;
// it still covers the box exactly. (The enlarged view fits photos itself —
// see FittedPhoto in PhotoLightbox.jsx.)
export default function PhotoImage({ photo, aspect = 4 / 3, style }) {
  const rotation = ((Number(photo.rotation) || 0) % 360 + 360) % 360;
  const sideways = rotation === 90 || rotation === 270;
  const turn = rotation ? "rotate(" + rotation + "deg)" : "";

  return (
    <img src={photo.url} alt={photo.caption || ""} draggable={false} style={sideways ? {
      position: "absolute", left: "50%", top: "50%",
      width: (100 / aspect) + "%", height: (100 * aspect) + "%",
      objectFit: "cover", transform: "translate(-50%, -50%) " + turn, transition: "transform .2s ease",
      ...style
    } : {
      position: "absolute", inset: 0, width: "100%", height: "100%",
      objectFit: "cover", transform: turn || undefined, transition: "transform .2s ease",
      ...style
    }} />
  );
}
