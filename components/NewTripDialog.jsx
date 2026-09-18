"use client";

import { useActionState, useState } from "react";
import { createTrip } from "@/app/actions";
import { TRANSPORT } from "@/lib/format";

export default function NewTripDialog() {
  const [open, setOpen] = useState(false);
  const [stops, setStops] = useState([0, 1]);
  const [state, action, pending] = useActionState(createTrip, null);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <i className="ph ph-plus" />New trip
      </button>
      {open && (
        <div className="dialog-backdrop" style={{ zIndex: 40 }} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="dialog" action={action} style={{ width: "min(620px, 100%)", maxHeight: "88vh", overflow: "auto" }}>
            <div className="dialog-title">New trip</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 130px", gap: 10 }}>
              <div className="field">
                <label htmlFor="nt-name">Trip name</label>
                <input className="input" id="nt-name" name="name" placeholder="Northern Loop" required />
              </div>
              <div className="field">
                <label htmlFor="nt-start">Starts</label>
                <input className="input" id="nt-start" name="start" type="date" required />
              </div>
              <div className="field">
                <label htmlFor="nt-end">Ends</label>
                <input className="input" id="nt-end" name="end" type="date" required />
              </div>
            </div>

            <div className="field">
              <label>Visibility</label>
              <div style={{ display: "flex", gap: 18, marginTop: 4 }}>
                <label className="radio">
                  <input type="radio" name="visibility" value="PRIVATE" defaultChecked />
                  <span className="dot" />Private — only me
                </label>
                <label className="radio">
                  <input type="radio" name="visibility" value="PUBLIC" />
                  <span className="dot" />Public — anyone with the link
                </label>
              </div>
            </div>

            <h6 className="text-muted" style={{ margin: "8px 0 0" }}>Destinations</h6>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stops.map((key, i) => (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 150px", gap: 8, alignItems: "end" }}>
                  <div className="field">
                    <label>Place</label>
                    <input className="input" name="place" placeholder="City" required={i === 0} />
                  </div>
                  <div className="field">
                    <label>Arrive</label>
                    <input className="input" name="arrive" type="date" />
                  </div>
                  <div className="field">
                    <label>Getting there</label>
                    <select className="input" name="transport" defaultValue={i === 0 ? "Flight" : "Train"}>
                      {TRANSPORT.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }}
                onClick={() => setStops((s) => [...s, Math.max(...s) + 1])}>
                <i className="ph ph-plus" />Add destination
              </button>
              <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
                Place names are geocoded on save so they land on the map.
              </p>
            </div>

            {state?.error && <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-300)" }}>{state.error}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create trip"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
