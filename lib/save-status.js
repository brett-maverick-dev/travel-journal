// What every inline field (components/Field.jsx) has left to save, shared by
// the save indicator (components/SaveStatus.jsx) and the warning the browser
// shows when you try to leave with something unsaved. Client-side only.
//
// Each field reports under its own token: "dirty" (typed, not sent yet),
// "saving", "error" (with a retry), or null once it's saved. Failed saves are
// retried when the browser comes back online and every 15 seconds.

const fields = new Map(); // token → { state, retry }
const listeners = new Set();
let snapshot = { state: "idle", savedAt: 0 };

function publish(savedNow) {
  const states = [...fields.values()].map((f) => f.state);
  const state = states.includes("error") ? "error"
    : states.includes("saving") ? "saving"
    : states.includes("dirty") ? "dirty"
    : "idle";
  const savedAt = savedNow ? Date.now() : snapshot.savedAt;
  if (state === snapshot.state && savedAt === snapshot.savedAt) return;
  snapshot = { state, savedAt };
  listeners.forEach((l) => l());
}

export function reportField(token, state, retry) {
  const was = fields.get(token)?.state;
  if (state) fields.set(token, { state, retry });
  else fields.delete(token);
  publish(!state && (was === "saving" || was === "error"));
}

export function retryFailed() {
  for (const f of fields.values()) if (f.state === "error") f.retry?.();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => snapshot;

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (snapshot.state === "idle") return;
    e.preventDefault();
    e.returnValue = ""; // older browsers need this to show the prompt
  });
  window.addEventListener("online", retryFailed);
  setInterval(() => { if (snapshot.state === "error" && navigator.onLine !== false) retryFailed(); }, 15000);
}
