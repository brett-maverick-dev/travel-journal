"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

// Destinations down the side; the selected destination's day pages one at a
// time in a carousel, instead of every page of the trip in one long scroll.
//
// The rows and page panels are rendered on the server (they hold the inline
// editors bound to server actions) and passed in as nodes keyed by id — this
// component only decides which of them is showing.
//
//   destinations: [{ id, name, dates, connector, row, addLabel?, emptyHint? }]
//                 in list order — the journey there ("departure") and home
//                 ("return") are items too. connector (drawn above the item,
//                 or null) and row are nodes.
//   groups:       { [destId]: [pageId, …] }               in display order
//   pages:        { [pageId]: { label, title, parentId?, panel } }   panel: node;
//                 parentId marks a subpage, which follows its main page in
//                 its group's list and has its tab stacked below that page's.
//   addPage:      optional server action (destId) => new page id
//   movePage:     optional server action (pageId, parentId | null, index) —
//                 lets the tabs be dragged below another page's to nest them.
const BOTTOM = 32; // the grid's bottom padding, which the pinned column must clear

export default function TripJournal({
  map, destinations, groups, pages, initialDestId, initialPageId,
  addDestination, addPage, movePage, emptyHint, stickyTop = 86
}) {
  const [sel, setSel] = useState(() => ({
    destId: initialDestId,
    pageId: initialPageId || groups[initialDestId]?.[0] || null
  }));
  const [dir, setDir] = useState("next");
  const [adding, startAdding] = useTransition();
  const carouselRef = useRef(null);
  const chipsRef = useRef(null);
  const pickerRef = useRef(null);
  const listRef = useRef(null);

  // Ids can disappear underneath us (a page or destination deleted), so
  // resolve the selection against what's actually there on every render.
  const destId = destinations.some((d) => d.id === sel.destId) ? sel.destId : destinations[0]?.id ?? null;

  // A dropped tab moves straight away; the server's order replaces this once
  // the move has saved and the page has re-rendered.
  const [, startMoving] = useTransition();
  const [move, showMove] = useOptimistic(null, (_, m) => m);
  const [drag, setDrag] = useState(null); // { id, isSub, x, y } while a tab is being dragged
  const [over, setOver] = useState(null); // the drop target under it, as a string key
  const stacks = arrange(groups[destId] || [], pages, move);
  const list = stacks.flatMap((st) => [st.id, ...st.subs]);
  const index = Math.max(0, list.indexOf(sel.pageId));
  const pageId = list[index] || null;
  const dest = destinations.find((d) => d.id === destId);

  // Flattened order across destinations, so next/prev carry on into the
  // neighbouring destination at either end instead of dead-ending.
  const order = destinations.flatMap((d) => (d.id === destId ? list : groups[d.id] || []).map((p) => ({ destId: d.id, pageId: p })));
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
    // Bring the new destination's first page into view if it's off screen —
    // on narrow screens the list sits below the journal.
    const box = carouselRef.current?.getBoundingClientRect();
    if (box && (box.top > window.innerHeight * 0.6 || box.top < 0)) carouselRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Same for the destination picker narrow screens get above the journal.
  useEffect(() => {
    const strip = pickerRef.current;
    const pill = strip?.querySelector("[aria-current='true']");
    if (!pill || !strip.offsetParent) return; // hidden on wide screens
    if (pill.offsetLeft < strip.scrollLeft || pill.offsetLeft + pill.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: pill.offsetLeft - 12, behavior: "smooth" });
    }
  }, [destId]);

  // The list scrolls on its own beside the pinned map; when next/prev moves
  // into another destination, bring that item into the list's view (the list
  // only — not the page, which scrollIntoView would also move).
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector(".dest-item[data-active='1']");
    if (!item || list.scrollHeight <= list.clientHeight) return;
    const top = item.offsetTop, bottom = top + item.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - 40), behavior: "smooth" });
    }
  }, [destId]);

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

  // Dragging a tab: drop it below another main page's tab (or onto one of
  // that page's subpages, to go before it) to make it a subpage there, or drop
  // a subpage onto a main page's tab to make it a main page again. Pointer
  // events rather than HTML drag and drop, which won't drag a <button> in
  // every browser or work with a finger: the mouse drags once it has moved a
  // few pixels, a finger after a long press — so a quick swipe still scrolls
  // the strip.
  const targets = useRef({}); // drop key → { parentId, index }, as last rendered
  targets.current = {};
  const target = (key, accept, parentId, index) => {
    if (!drag || !accept) return {};
    targets.current[key] = { parentId, index };
    return { "data-drop-key": key, "data-drop": over === key ? "1" : "0" };
  };
  const session = useRef(null); // { id, isSub, x, y, started, over, timer }
  const ghost = useRef(null);
  const swallowClick = useRef(false);
  const endDrag = () => {
    clearTimeout(session.current?.timer);
    // A press that became a drag ends in a click — on the tab, or on whatever
    // the pointer was let go over — that mustn't count as picking a tab.
    if (session.current?.started) setTimeout(() => { swallowClick.current = false; }, 250);
    session.current = null;
    setDrag(null);
    setOver(null);
  };
  const dragTo = (x, y) => {
    const s = session.current;
    if (ghost.current) ghost.current.style.transform = "translate(" + (x + 12) + "px, " + (y + 10) + "px)";
    const key = document.elementFromPoint(x, y)?.closest("[data-drop-key]")?.getAttribute("data-drop-key") || null;
    if (key !== s.over) { s.over = key; setOver(key); }
  };
  const startDrag = (x, y) => {
    const s = session.current;
    s.started = true;
    swallowClick.current = true;
    setDrag({ id: s.id, isSub: s.isSub, x, y });
  };
  const finishDrag = () => {
    const s = session.current;
    const to = s?.started && s.over ? targets.current[s.over] : null;
    endDrag();
    if (!to) return;
    startMoving(async () => {
      showMove({ id: s.id, ...to });
      await movePage(s.id, to.parentId, to.index);
    });
  };
  const live = useRef(null); // the latest of the above, for listeners added mid-press
  live.current = { dragTo, startDrag, finishDrag, endDrag };

  const onChipPointerDown = (e, id, isSub) => {
    if (!movePage || e.pointerType === "touch" || e.button !== 0) return;
    session.current = { id, isSub, x: e.clientX, y: e.clientY, started: false, over: null };
    const onMove = (ev) => {
      const s = session.current;
      if (!s) return;
      if (!s.started) {
        if (Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 5) return;
        live.current.startDrag(ev.clientX, ev.clientY);
      }
      ev.preventDefault(); // no text selection while dragging
      live.current.dragTo(ev.clientX, ev.clientY);
    };
    const stop = (commit) => () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      if (commit) live.current.finishDrag(); else live.current.endDrag();
    };
    const onUp = stop(true), onCancel = stop(false);
    const onKey = (ev) => { if (ev.key === "Escape") onCancel(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  };
  // Fingers: hold still on a tab to pick it up. Moving first is a scroll, and
  // is left alone; once the tab is up, touchmove is cancelled (natively — React's
  // touch listeners are passive) so the strip and page stay put.
  const onChipTouchStart = (e, id, isSub) => {
    if (!movePage || e.touches.length !== 1) return;
    const t0 = e.touches[0];
    const s = session.current = { id, isSub, x: t0.clientX, y: t0.clientY, started: false, over: null };
    s.timer = setTimeout(() => { live.current.startDrag(s.x, s.y); navigator.vibrate?.(10); }, 380);
    const onMove = (ev) => {
      if (session.current !== s) return;
      const t = ev.touches[0];
      if (!s.started) {
        if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > 8) stop(false)();
        return;
      }
      ev.preventDefault();
      live.current.dragTo(t.clientX, t.clientY);
    };
    const stop = (commit) => () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
      if (session.current !== s) return;
      if (commit && s.started) live.current.finishDrag(); else live.current.endDrag();
    };
    const onEnd = stop(true), onCancel = stop(false);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onCancel);
  };

  const chip = (id, i, sub, stack) => {
    const others = stack && drag ? stack.subs.filter((x) => x !== drag.id) : [];
    const dropProps = drag?.id === id ? {}
      : sub
        // Onto a subpage's tab: in among that page's subpages, before it.
        ? target("before:" + id, stack.id !== drag?.id, stack.id, others.indexOf(id))
        // Onto a main page's tab: a dragged subpage becomes a main page.
        : target("main:" + id, drag?.isSub, null);
    return (
      <button key={id} type="button" role="tab" className={"page-chip" + (sub ? " page-chip-sub" : "")}
        aria-current={id === pageId ? "true" : undefined} aria-selected={id === pageId}
        data-dragging={drag?.id === id ? "1" : undefined}
        data-movable={movePage ? "1" : undefined}
        title={movePage ? (sub ? "Drag onto a main page's tab to make it a main page again" : "Drag below another page's tab to make this a subpage") : undefined}
        onPointerDown={(e) => onChipPointerDown(e, id, sub)}
        onTouchStart={(e) => onChipTouchStart(e, id, sub)}
        onContextMenu={(e) => { if (session.current) e.preventDefault(); }}
        {...dropProps}
        onClick={() => {
          if (swallowClick.current) { swallowClick.current = false; return; }
          go({ destId, pageId: id }, i < index ? "prev" : "next");
        }}>
        <span className="page-chip-date">
          {sub && <i className="ph ph-arrow-elbow-down-right" aria-hidden="true" />}{pages[id]?.label}
        </span>
        <span className="page-chip-title">{pages[id]?.title || "Untitled"}</span>
      </button>
    );
  };

  const onAddPage = () => startAdding(async () => {
    const id = await addPage(destId);
    if (id) { setDir("next"); setSel({ destId, pageId: id }); }
  });

  return (
    <div className="page-shell split journal" style={{ display: "grid", gridTemplateColumns: "308px minmax(0, 1fr)", gap: 48, alignItems: "start", paddingBottom: BOTTOM }}>
      {/* Pinned at the top while the page scrolls, and never taller than the
          window: the map and heading stay put and only the list scrolls. It
          also has to fit above the grid's bottom padding — a sticky box that
          doesn't gets pushed up at the very end of the page. */}
      <div className="spine" style={{
        position: "sticky", top: stickyTop, display: "flex", flexDirection: "column", gap: 20,
        maxHeight: "calc(100vh - " + (stickyTop + BOTTOM + 8) + "px)"
      }}>
        <div style={{ flex: "none" }}>{map}</div>

        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: "1 1 auto" }}>
          <h6 className="text-muted" style={{ margin: "0 0 12px", flex: "none" }}>Destinations</h6>
          <div ref={listRef} className="spine-list">
          {destinations.map((d) => {
            const count = groups[d.id]?.length || 0;
            const active = d.id === destId;
            return (
              <div key={d.id}>
                {d.id === "return" && addDestination /* new destinations go before the trip home */}
                {d.connector}
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
          {!destinations.some((d) => d.id === "return") && addDestination}
          </div>
        </div>
      </div>

      <div ref={carouselRef} className="journal-main" style={{ display: "flex", flexDirection: "column", gap: 18, scrollMarginTop: stickyTop + 10, minWidth: 0 }}>
        {/* Narrow screens only: the journal comes first there, with the full
            destination list (and its editors) after it, so this is how you
            move between stops. */}
        {destinations.length > 1 && (
          <div ref={pickerRef} className="dest-picker" aria-label="Destinations">
            {destinations.map((d) => {
              const count = groups[d.id]?.length || 0;
              return (
                <button key={d.id} type="button" className="dest-pill" aria-current={d.id === destId ? "true" : undefined}
                  onClick={() => pickDestination(d.id)}>
                  <span>{d.name}</span><span className="dest-pill-count">{count}</span>
                </button>
              );
            })}
          </div>
        )}
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
              <div>
                <div ref={chipsRef} className="page-chips" role="tablist" aria-label={"Pages in " + dest.name}
                  data-dragging={drag ? "1" : undefined}>
                  {stacks.map((st) => (
                    <div key={st.id} className="page-chip-stack">
                      {chip(st.id, list.indexOf(st.id), false)}
                      {st.subs.map((id) => chip(id, list.indexOf(id), true, st))}
                      {drag && drag.id !== st.id && (
                        <div className="page-chip-slot" {...target("under:" + st.id, true, st.id)}>
                          <i className="ph ph-arrow-elbow-down-right" aria-hidden="true" />Subpage
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {drag && (
                  <div ref={ghost} className="page-chip-ghost" aria-hidden="true"
                    style={{ transform: "translate(" + (drag.x + 12) + "px, " + (drag.y + 10) + "px)" }}>
                    {pages[drag.id]?.title || "Untitled"}
                  </div>
                )}
                {drag && (
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }} aria-live="polite">
                    {drag.isSub
                      ? "Drop below a page to move it there, or onto a main page's tab to make it a main page."
                      : "Drop below a page to make this one of its subpages."}
                  </div>
                )}
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
                {dest.emptyHint || emptyHint || "No pages here yet."}
              </p>
            )}

            {addPage && (
              <button className="dashed" disabled={adding} onClick={onAddPage}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: 16, fontSize: 13 }}>
                <i className={adding ? "ph ph-circle-notch" : "ph ph-plus"} />
                {adding ? "Adding…" : dest.addLabel || "Add a page to " + dest.name}
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

// The tabs as stacks: each main page with its subpages, in display order.
// `list` already has subpages right after their main page (see
// groupPagesByDestination); `move` is a drop not yet saved, applied on top.
function arrange(list, pages, move) {
  const stacks = [];
  for (const id of list) {
    const last = stacks[stacks.length - 1];
    if (last && pages[id]?.parentId === last.id) last.subs.push(id);
    else stacks.push({ id, subs: [] });
  }
  if (!move) return stacks;

  const from = stacks.findIndex((st) => st.id === move.id || st.subs.includes(move.id));
  if (from < 0) return stacks;
  const home = stacks[from];
  let carry;
  if (home.id === move.id) { carry = [move.id, ...home.subs]; stacks.splice(from, 1); }
  else { carry = [move.id]; stacks[from] = { ...home, subs: home.subs.filter((x) => x !== move.id) }; }

  if (!move.parentId) {
    // A main page again: the server puts it back in date order; until then it
    // sits after the page it came from.
    stacks.splice(stacks.findIndex((st) => st.id === home.id) + 1, 0, { id: move.id, subs: [] });
    return stacks;
  }
  const to = stacks.findIndex((st) => st.id === move.parentId);
  if (to < 0) return stacks;
  const subs = [...stacks[to].subs];
  subs.splice(move.index ?? subs.length, 0, ...carry);
  stacks[to] = { ...stacks[to], subs };
  return stacks;
}
