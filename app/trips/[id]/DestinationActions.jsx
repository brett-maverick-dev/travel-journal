"use client";

import { useTransition } from "react";
import { deleteDestination, makeDeparture } from "@/app/actions";

// Remove a destination, or (first destination only) turn it into the trip's
// departure city — how trips made before departure stopped being a
// destination get their home city out of the page list.
export default function DestinationActions({ destinationId, name, canMakeDeparture }) {
  const [pending, start] = useTransition();
  const run = (e, message, action) => {
    e.stopPropagation(); // the row itself selects the destination on click
    if (confirm(message)) start(() => action(destinationId));
  };

  return (
    <span style={{ display: "inline-flex", gap: 2, opacity: pending ? 0.5 : 1 }}>
      {canMakeDeparture && (
        <button type="button" className="btn btn-ghost btn-icon dest-action" disabled={pending}
          title="Make this the departure city"
          onClick={(e) => run(e,
            "Make " + name + " the departure city? It moves to “Leaving from” and its blank pages are removed — pages you've written in stay.",
            makeDeparture)}>
          <i className="ph ph-house-line" />
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-icon dest-action" disabled={pending}
        title="Remove destination"
        onClick={(e) => run(e,
          "Remove " + name + " from this trip? Its blank pages are removed — pages you've written in stay.",
          deleteDestination)}>
        <i className={pending ? "ph ph-circle-notch" : "ph ph-trash"} />
      </button>
    </span>
  );
}
