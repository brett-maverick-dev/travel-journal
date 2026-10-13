"use client";

import { useEffect, useRef } from "react";

const CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function load(tag, attrs, key) {
  const found = document.querySelector("[data-lf='" + key + "']");
  if (found) return found._p || Promise.resolve();
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  el.setAttribute("data-lf", key);
  el._p = new Promise((res) => { el.onload = res; el.onerror = res; });
  document.head.appendChild(el);
  return el._p;
}

// Leaflet takes raw HTML strings for markers and popups, so every user-entered
// value (trip names, places, URLs) has to be escaped before it goes in.
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// The shortest path over the globe between two [lat, lng] points — the arc a
// flight actually follows — as a polyline with a point every ~2°. A straight
// line on the flat map would send Phoenix → Tokyo east across the Atlantic.
function greatCircle([lat1, lng1], [lat2, lng2]) {
  const r = Math.PI / 180;
  const vec = (lat, lng) => [Math.cos(lat * r) * Math.cos(lng * r), Math.cos(lat * r) * Math.sin(lng * r), Math.sin(lat * r)];
  const a = vec(lat1, lng1), b = vec(lat2, lng2);
  const omega = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (omega < 1e-6 || Math.PI - omega < 1e-6) return [[lat1, lng1], [lat2, lng2]];
  const n = Math.max(2, Math.ceil(omega / r / 2));
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s1 = Math.sin((1 - t) * omega) / Math.sin(omega), s2 = Math.sin(t * omega) / Math.sin(omega);
    const [x, y, z] = [0, 1, 2].map((k) => s1 * a[k] + s2 * b[k]);
    points.push([Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r]);
  }
  return points;
}

// Shift each longitude by whole turns so it stays within 180° of the one
// before — a route over the Pacific then crosses the date line as one
// continuous line instead of snapping back across the whole map.
function unwrap(points, startLng) {
  let prev = startLng;
  return points.map(([lat, lng]) => {
    const shifted = lng + Math.round((prev - lng) / 360) * 360;
    prev = shifted;
    return [lat, shifted];
  });
}

// A trip's stops placed on the map: positions (longitudes unwrapped along the
// route, so pins sit on the line) and the route through them as arcs.
function layout(stops) {
  const placed = [], path = [];
  stops.forEach((s, i) => {
    if (i === 0) { placed.push([s.lat, s.lng]); path.push([s.lat, s.lng]); return; }
    const prev = stops[i - 1];
    const arc = unwrap(greatCircle([prev.lat, prev.lng], [s.lat, s.lng]), placed[i - 1][1]);
    path.push(...arc.slice(1));
    placed.push(arc[arc.length - 1]);
  });
  return { placed, path };
}

// variant: "primary" (the trip's first destination, labelled with the trip
// name), "stop" (later destinations) or "departure" (where the trip starts).
function pin(label, variant) {
  const primary = variant === "primary";
  const dot = primary
    ? "<span style='width:11px;height:11px;border-radius:50%;background:#968ae0;box-shadow:0 0 0 4px rgba(150,138,224,.22),0 0 12px rgba(150,138,224,.7);flex:none'></span>"
    : variant === "departure"
      ? "<i class='ph ph-house-line' style='font-size:12px;line-height:1;color:#cfd3e5;flex:none'></i>"
      : "<span style='width:7px;height:7px;border-radius:50%;border:1.5px solid #b5abfc;flex:none'></span>";
  const text = "<span class='tm-lbl' style='font:" + (primary ? "500 12px" : "400 10px") +
    "/1 Inter,system-ui,sans-serif;color:" + (primary ? "#e9e9ed" : "#b2b6ca") +
    ";white-space:nowrap'>" + esc(label) + "</span>";
  return "<div class='tm-pin' style='display:flex;align-items:center;gap:6px;transform:translate(-5px,-5px);" +
    "padding:3px 7px 3px 4px;border-radius:999px;background:rgba(22,24,38,.72);cursor:pointer'>" +
    dot + text + "</div>";
}

function popup(trip) {
  const cover = trip.coverUrl
    ? "<img src='" + esc(trip.coverUrl) + "' alt='' style='width:100%;height:118px;object-fit:cover'>"
    : "<div style='height:118px;background:#292b31'></div>";
  return "<div style='padding:0 0 12px'>" + cover +
    "<div style='padding:10px 12px 0'>" +
    "<div style='font:400 10px/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#968ae0'>" +
      esc(trip.country) + "</div>" +
    "<div style='font:500 17px/1.2 Inter,sans-serif;margin:5px 0 4px'>" + esc(trip.name) + "</div>" +
    "<div style='font:400 12px/1.4 Inter,sans-serif;color:#9397ab'>" + esc(trip.dateRange) + "</div>" +
    "<a href='" + esc(trip.href) + "' style='display:flex;justify-content:center;margin-top:10px;" +
    "border:1px solid #968ae0;color:#968ae0;border-radius:8px;padding:7px 10px;" +
    "font:500 13px/1.2 Inter,sans-serif;text-decoration:none'>Open trip</a>" +
    "</div></div>";
}

export default function TripMap({ trips, height = 420, only = false, hoverId = "" }) {
  const host = useRef(null);
  const state = useRef({});

  useEffect(() => {
    let dead = false;
    (async () => {
      await load("link", { rel: "stylesheet", href: CSS }, "css");
      await load("script", { src: JS }, "js");
      const L = window.L;
      if (dead || !L || !host.current || state.current.map) return;

      const map = L.map(host.current, {
        // A route like Phoenix → Tokyo spans a third of the globe; the small
        // per-trip map needs zoom 1 to fit that in ~300px.
        zoomControl: false, worldCopyJump: true, scrollWheelZoom: false, minZoom: only ? 1 : 2
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors", maxZoom: 18
      }).addTo(map);

      const groups = {};
      const all = [];
      trips.forEach((trip) => {
        const pts = trip.stops.filter((s) => s.lat != null && s.lng != null);
        if (!pts.length) return;
        const group = L.layerGroup().addTo(map);
        const { placed, path } = layout(pts);
        path.forEach((c) => all.push(c)); // arcs can bow well outside their end points
        if (pts.length > 1) {
          group.addLayer(L.polyline(path, { color: "#968ae0", weight: 1.4, opacity: 0.5, dashArray: "4 5" }));
        }
        const firstDest = pts.findIndex((s) => s.kind !== "departure");
        pts.forEach((s, i) => {
          const variant = s.kind === "departure" ? "departure" : i === firstDest ? "primary" : "stop";
          const m = L.marker(placed[i], {
            icon: L.divIcon({ className: "", iconSize: null, html: pin(variant === "primary" ? trip.name : s.name, variant) })
          });
          if (!only) m.bindPopup(popup(trip), { minWidth: 236, maxWidth: 236, offset: [4, -2] });
          group.addLayer(m);
        });
        groups[trip.id] = group;
      });

      const zoomClass = () => host.current?.classList.toggle("tm-far", map.getZoom() < 6);
      map.on("zoomend", zoomClass);

      const fit = () => {
        if (dead) return;
        if (!all.length) return map.setView([20, 10], 2);
        map.invalidateSize();
        map.fitBounds(L.latLngBounds(all).pad(only ? 0.45 : 0.18), { maxZoom: only ? 8 : 5 });
        zoomClass();
      };
      fit();
      setTimeout(fit, 250);
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(host.current);
        state.current.ro = ro;
      }
      state.current = { ...state.current, map, groups };
    })();

    return () => {
      dead = true;
      state.current.ro?.disconnect();
      state.current.map?.remove();
      state.current = {};
    };
  }, [trips, only]);

  useEffect(() => {
    const { groups } = state.current;
    if (!groups) return;
    Object.entries(groups).forEach(([id, group]) => {
      const lit = !hoverId || hoverId === id;
      group.eachLayer((layer) => {
        const node = layer.getElement?.();
        if (node) {
          node.style.transition = "opacity .18s ease";
          node.style.opacity = lit ? "1" : "0.22";
          const lbl = node.querySelector?.(".tm-lbl");
          if (lbl) lbl.style.display = hoverId === id ? "inline" : "";
        }
        layer.setStyle?.({ opacity: lit ? 0.5 : 0.1 });
      });
    });
  }, [hoverId]);

  return (
    <div style={{ position: "relative", height, borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "var(--shadow-sm)", zIndex: 0, isolation: "isolate" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
