"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { reportField } from "@/lib/save-status";

// Inline edit bound to a save action.
//
// Text inputs save on blur or Enter; textareas also save a second after you
// stop typing (autosave). Selects and dates save on change. A save action may
// return { error } to refuse a value: the field reverts and shows the message
// as a native validation bubble.
//
// Nothing typed is lost to a closed tab or a dropped connection: with a
// draftKey, unsaved text is kept in this browser until it saves (and put back
// if the page is reopened first), failed saves are retried (lib/save-status),
// and leaving the page while something is unsaved asks first.
//
// quiet: no box until hovered or focused — reads as text, edits in place.
const AUTOSAVE_MS = 1000;

const readDraft = (key) => {
  try { return JSON.parse(localStorage.getItem("draft:" + key) || "null"); } catch { return null; }
};
const writeDraft = (key, text, base) => {
  try { localStorage.setItem("draft:" + key, JSON.stringify({ text, base, at: Date.now() })); } catch {}
};
const clearDraft = (key) => {
  try { localStorage.removeItem("draft:" + key); } catch {}
};

export default function Field({
  value, save, as = "input", type = "text", options, style, placeholder, rows,
  draftKey, autosave = as === "textarea", quiet = false
}) {
  const server = value ?? "";
  const [draft, setDraft] = useState(server);
  const [restored, setRestored] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef(null);
  const token = useRef({}).current; // this field, to lib/save-status
  const base = useRef(server);      // what the server has, as far as we know
  const sent = useRef(null);        // the value of the latest save we sent
  const latest = useRef(server);    // the draft as of the last keystroke
  const timer = useRef(null);
  latest.current = draft;

  const saveNow = (next) => {
    clearTimeout(timer.current);
    if (next === base.current) { reportField(token, null); return; }
    sent.current = next;
    reportField(token, "saving");
    start(async () => {
      let res;
      try {
        res = await save(next);
      } catch {
        // Offline, or the server fell over: keep the text and try again later.
        reportField(token, "error", () => saveNow(latest.current));
        return;
      }
      const el = ref.current;
      if (res?.error) {
        setDraft(base.current);
        if (draftKey) clearDraft(draftKey);
        reportField(token, null);
        if (el) { el.setCustomValidity(res.error); el.reportValidity(); }
        return;
      }
      el?.setCustomValidity("");
      base.current = next;
      if (latest.current === next) {
        if (draftKey) clearDraft(draftKey);
        setRestored(false);
        reportField(token, null);
      } else {
        reportField(token, "dirty"); // typed on while it saved; the timer picks that up
      }
    });
  };
  const live = useRef(null);
  live.current = { saveNow };

  // A newer value from the server — our own save coming back, a collaborator's
  // edit, or a blank trip name stored as "Untitled trip". Take it unless you've
  // typed something since that it would wipe out.
  useEffect(() => {
    const before = base.current;
    base.current = server;
    setDraft((d) => (d === before || d === sent.current ? server : d));
  }, [server]);

  // Text left unsaved last time this page was open (closed tab, no signal).
  useEffect(() => {
    if (!draftKey) return;
    const kept = readDraft(draftKey);
    if (!kept || kept.text === server) { if (kept) clearDraft(draftKey); return; }
    setDraft(kept.text);
    setRestored(true);
    // Saved straight away if the server copy is still the one it was written
    // over; if someone has changed it since, it waits for you to look first.
    if (kept.base === server) live.current.saveNow(kept.text);
    else reportField(token, "dirty");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Leaving the page (another tab of the carousel, another route): save what's
  // there rather than drop it.
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (latest.current !== base.current && latest.current !== sent.current) live.current.saveNow(latest.current);
  }, []);

  // Textareas grow with their text instead of scrolling inside the page.
  useLayoutEffect(() => {
    const el = ref.current;
    if (as !== "textarea" || !el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [draft, as]);

  const onType = (next) => {
    setDraft(next);
    setRestored(false);
    if (next === base.current) {
      clearTimeout(timer.current);
      if (draftKey) clearDraft(draftKey);
      reportField(token, null);
      return;
    }
    if (draftKey) writeDraft(draftKey, next, base.current);
    reportField(token, "dirty");
    if (autosave) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => live.current.saveNow(latest.current), AUTOSAVE_MS);
    }
  };
  const commit = () => { if (draft !== base.current && draft !== sent.current) saveNow(draft); };

  const common = {
    ref,
    className: "input" + (quiet ? " input-quiet" : ""),
    value: draft,
    placeholder,
    onChange: (e) => { e.target.setCustomValidity(""); onType(e.target.value); },
    onBlur: commit,
    style
  };
  // Selects and dates save as they change, so dim them while that happens.
  const dim = { ...style, opacity: pending ? 0.6 : 1 };

  if (as === "select") {
    return (
      <select {...common} style={dim} onBlur={undefined} onChange={(e) => { setDraft(e.target.value); saveNow(e.target.value); }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (as === "textarea") {
    return (
      <>
        <textarea {...common} className={common.className + " input-grow"} rows={rows || 3} />
        {restored && (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            <i className="ph ph-clock-counter-clockwise" style={{ marginRight: 4 }} />
            Restored text you hadn't saved — it saves when you click away.
          </div>
        )}
      </>
    );
  }
  if (type === "date") {
    // Clearing a date input (or typing through a half-entered one) reports "" —
    // keep that local instead of trying to save an empty date.
    return <input {...common} style={dim} type="date" onBlur={() => { if (!draft) setDraft(base.current); }}
      onChange={(e) => { setDraft(e.target.value); if (e.target.value) saveNow(e.target.value); }} />;
  }
  return <input {...common} type={type} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
