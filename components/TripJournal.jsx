"use client";

import { useEffect, useRef, useState, useTransition } from "react";

// Destinations down the side; the selected destination's day pages one at a
// time in a carousel, instead of every page of the trip in one long scroll.
//
// The rows and page panels are rendered on the server (they hold the inline
// editors bound to server actions) and passed in as nodes keyed by id — this
// component only decides which of them is showing.
//
//   destinations: [{ id, name, dates, connector, row }]   connector/row: nodes
//   groups:       { [destId]: [pageId, …] }               in display order
//   pages:        { [pageId]: { label, title, panel } }   panel: node
//   addPage:      optional server action (destId) => new page id
//   departure:    optional "Leaving from" node above the list; with
//                 departureSet, the first destination's connector (its
//                 "Getting there") is drawn too, as the leg from there
export default function TripJournal({
  map, destinations, groups, pages, initialDestId, initialPageId,
  addDestination, addPage, emptyHint, stickyTop = 86, departure, departureSet
}) {
  const [sel, setSel] = useState(() => ({
    destId: initialDestId,
    pageId: initialPageId || groups[initialDestId]?.[0] || null
  }));
  const [dir, setDir] = useState("next");
  const [adding, startAdding] = useTransition();
  const carouselRef = useRef(null);
  const chipsRef = useRef(null);

  // Ids can disappear underneath us (a page or destination deleted), so
  // resolve the selection against what's actually there on every render.
  const destId = destinations.some((d) => d.id === sel.destId) ? sel.destId : destinations[0]?.id ?? null;
  const list = groups[destId] || [];
  const index = Math.max(0, list.indexOf(sel.pageId));
  const pageId = list[index] || null;
  const dest = destinations.find((d) => d.id === destId);

  // Flattened order across destinations, so next/prev carry on into the
  // neighbouring destination at either end instead of dead-ending.
  const order = destinations.flatMap((d) => (groups[d.id] || []).map((p) => ({ destId: d.id, pageId: p })));
  const at = order.findIndex((o) => o.pageId === pageId);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const nameOf = (id) => destinations.find((d) => d.id === id)?.name;

  const go = (target, direction) => {
    if (!target) return;
    setDir(direction);
    setSel(target);
  };

  const pickDestination = (id) => {
    if (id === destId) return;
    const ids = destinations.map((d) => d.id);
    setDir(ids.indexOf(id) < ids.indexOf(destId) ? "prev" : "next");
    setSel({ destId: id, pageId: groups[id]?.[0] || null });
    // Stacked layout on narrow screens: the carousel sits below the list.
    const box = carouselRef.current?.getBoundingClientRect();
    if (box && box.top > window.innerHeight * 0.6) carouselRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Keep the URL pointing at what's on screen, so reloads, shared links and
  // the activity page's back link land on the same page.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.hash = "";
    if (destId) url.searchParams.set("d", destId); else url.searchParams.delete("d");
    if (pageId) url.searchParams.set("p", pageId); else url.searchParams.delete("p");
    window.history.replaceState(window.history.state, "", url);
  }, [destId, pageId]);

  // Bring the active chip into view by scrolling only the chip strip —
  // scrollIntoView would also scroll the window and cancel the scroll down to
  // the carousel that picking a destination starts on narrow screens.
  useEffect(() => {
    const strip = chipsRef.current;
    const chip = strip?.querySelector("[aria-current='true']");
    if (!chip) return;
    const left = chip.offsetLeft; // .page-chips is position: relative, so this is strip-relative
    if (left < strip.scrollLeft || left + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - 12, behavior: "smooth" });
    }
  }, [pageId]);

  // Arrow keys flip pages — unless you're typing in one of the page's fields.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowRight" && next) { e.preventDefault(); go(next, "next"); }
      if (e.key === "ArrowLeft" && prev) { e.preventDefault(); go(prev, "prev"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Horizontal swipe on touch screens, ignoring gestures that start in a field.
  const touch = useRef(null);
  const onTouchStart = (e) => {
    if (e.target.closest("input, textarea, select")) { touch.current = null; return; }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) go(next, "next"); else go(prev, "prev");
  };

  const onAddPage = () => startAdding(async () => {
    const id = await addPage(destId);
    if (id) { setDir("next"); setSel({ destId, pageId: id }); }
  });

  return (
    <div className="page-shell split" style={{ display: "grid", gridTemplateColumns: "308px minmax(0, 1fr)", gap: 48, alignItems: "start" }}>
      <div className="spine" style={{ position: "sticky", top: stickyTop, display: "flex", flexDirection: "column", gap: 20 }}>
        {map}

        <div>
          <h6 className="text-muted" style={{ margin: "0 0 12px" }}>Destinations</h6>
          {departure}
          {destinations.map((d, i) => {
            const count = groups[d.id]?.length || 0;
            const active = d.id === destId;
            return (
              <div key={d.id}>
                {(i > 0 || departureSet) && d.connector}
                <div className="dest-item" data-active={active ? "1" : "0"} onClick={() => pickDestination(d.id)}>
                  {d.row}
                  <button type="button" className="dest-open" aria-current={active ? "true" : undefined}
                    onClick={(e) => { e.stopPropagation(); pickDestination(d.id); }}>
                    {count} {count === 1 ? "page" : "pages"}
                    <i className={"ph " + (active ? "ph-caret-right" : "ph-arrow-right")} />
                  </button>
                </div>
              </div>
            );
          })}
          {addDestination}
        </div>
      </div>

      <div ref={carouselRef} style={{ display: "flex", flexDirection: "column", gap: 18, scrollMarginTop: stickyTop + 10, minWidth: 0 }}>
        {dest ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div className="card-kicker">{dest.dates}</div>
                <h2 style={{ margin: "4px 0 0" }}>{dest.name}</h2>
              </div>
              {list.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-muted" style={{ fontSize: 12, marginRight: 4 }} aria-live="polite">
                    Page {index + 1} of {list.length}
                  </span>
                  <button type="button" className="btn btn-secondary btn-icon" disabled={!prev}
                    onClick={() => go(prev, "prev")}
                    title={prev ? (prev.destId === destId ? "Previous page" : "Back to " + nameOf(prev.destId)) : undefined}
                    aria-label="Previous page">
                    <i className="ph ph-caret-left" />
                  </button>
                  <button type="button" className="btn btn-secondary btn-icon" disabled={!next}
                    onClick={() => go(next, "next")}
                    title={next ? (next.destId === destId ? "Next page" : "On to " + nameOf(next.destId)) : undefined}
                    aria-label="Next page">
                    <i className="ph ph-caret-right" />
                  </button>
                </div>
              )}
            </div>

            {list.length > 1 && (
              <div ref={chipsRef} className="page-chips" role="tablist" aria-label={"Pages in " + dest.name}>
                {list.map((id, i) => (
                  <button key={id} type="button" role="tab" className="page-chip"
                    aria-current={id === pageId ? "true" : undefined} aria-selected={id === pageId}
                    onClick={() => go({ destId, pageId: id }, i < index ? "prev" : "next")}>
                    <span className="page-chip-date">{pages[id]?.label}</span>
                    <span className="page-chip-title">{pages[id]?.title || "Untitled"}</span>
                  </button>
                ))}
              </div>
            )}

            {pageId ? (
              <div className="carousel-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                <div key={pageId} className={"carousel-slide carousel-in-" + dir}>
                  {pages[pageId]?.panel}
                </div>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>
                {emptyHint || "No pages here yet."}
              </p>
            )}

            {addPage && (
              <button className="dashed" disabled={adding} onClick={onAddPage}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: 16, fontSize: 13 }}>
                <i className={adding ? "ph ph-circle-notch" : "ph ph-plus"} />
                {adding ? "Adding…" : "Add a page to " + dest.name}
              </button>
            )}
          </>
        ) : (
          <p className="text-muted" style={{ fontSize: 14 }}>
            {emptyHint || "Add a destination to start writing pages."}
          </p>
        )}
      </div>
    </div>
  );
}
