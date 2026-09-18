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

function pin(label, primary) {
  const dot = primary
    ? "<span style='width:11px;height:11px;border-radius:50%;background:#968ae0;box-shadow:0 0 0 4px rgba(150,138,224,.22),0 0 12px rgba(150,138,224,.7);flex:none'></span>"
    : "<span style='width:7px;height:7px;border-radius:50%;border:1.5px solid #b5abfc;flex:none'></span>";
  const text = "<span class='tm-lbl' style='font:" + (primary ? "500 12px" : "400 10px") +
    "/1 Inter,system-ui,sans-serif;color:" + (primary ? "#e9e9ed" : "#b2b6ca") +
    ";white-space:nowrap'>" + label + "</span>";
  return "<div class='tm-pin' style='display:flex;align-items:center;gap:6px;transform:translate(-5px,-5px);" +
    "padding:3px 7px 3px 4px;border-radius:999px;background:rgba(22,24,38,.72);cursor:pointer'>" +
    dot + text + "</div>";
}

function popup(trip) {
  const cover = trip.coverUrl
    ? "<img src='" + trip.coverUrl + "' alt='' style='width:100%;height:118px;object-fit:cover'>"
    : "<div style='height:118px;background:#292b31'></div>";
  return "<div style='padding:0 0 12px'>" + cover +
    "<div style='padding:10px 12px 0'>" +
    "<div style='font:400 10px/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#968ae0'>" +
      trip.country + "</div>" +
    "<div style='font:500 17px/1.2 Inter,sans-serif;margin:5px 0 4px'>" + trip.name + "</div>" +
    "<div style='font:400 12px/1.4 Inter,sans-serif;color:#9397ab'>" + trip.dateRange + "</div>" +
    "<a href='" + trip.href + "' style='display:flex;justify-content:center;margin-top:10px;" +
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
        zoomControl: false, worldCopyJump: true, scrollWheelZoom: false, minZoom: 2
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
        const coords = pts.map((s) => [s.lat, s.lng]);
        coords.forEach((c) => all.push(c));
        if (coords.length > 1) {
          group.addLayer(L.polyline(coords, { color: "#968ae0", weight: 1.4, opacity: 0.5, dashArray: "4 5" }));
        }
        pts.forEach((s, i) => {
          const m = L.marker([s.lat, s.lng], {
            icon: L.divIcon({ className: "", iconSize: null, html: pin(i === 0 ? trip.name : s.name, i === 0) })
          });
          if (!only) m.bindPopup(popup(trip), { minWidth: 236, maxWidth: 236, offset: [4, -2] });
          group.addLayer(m);
        });
        groups[trip.id] = group;
      });

      const zoomClass = () => host.current?.classList.toggle("tm-far", map.getZoom() < 6);
      map.on("zoomend", zoomClass);

      const fit = () => {
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
    <div style={{ position: "relative", height, borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
