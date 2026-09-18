"use client";

import { useTransition } from "react";
import { deleteTrip } from "@/app/actions";

export default function DeleteTripButton({ tripId, tripName, style }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-secondary" disabled={pending} style={style}
      onClick={() => {
        if (confirm('Delete "' + tripName + '"? This removes its destinations, pages, and photos.')) {
          start(() => deleteTrip(tripId));
        }
      }}>
      <i className="ph ph-trash" />{pending ? "Deleting…" : "Delete trip"}
    </button>
  );
}
