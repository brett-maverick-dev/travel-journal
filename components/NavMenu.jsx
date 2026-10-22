"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// The nav's links. On narrow screens they fold behind a menu button (see
// .nav-links in globals.css) instead of squeezing onto one line.
export default function NavMenu({ children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="nav-menu">
      <button type="button" className="btn btn-ghost btn-icon nav-toggle" aria-expanded={open} aria-label="Menu"
        onClick={() => setOpen((o) => !o)}>
        <i className={"ph " + (open ? "ph-x" : "ph-list")} style={{ fontSize: 20 }} />
      </button>
      <div className="nav-links" data-open={open ? "1" : "0"} onClick={(e) => { if (e.target.closest("a")) setOpen(false); }}>
        {children}
      </div>
    </div>
  );
}
