"use client";

import { useState } from "react";
import EditEventForm, { type EditableEvent } from "./edit-event-form";

/**
 * Client wrapper for one event row in /admin/artists/[slug]. Owns the
 * outer card div, the read-only display (passed in as `children`), and the
 * "✏️ Edit" toggle that expands an EditEventForm inline below.
 *
 * The server-rendered page.tsx still does all the heavy lifting (RSVP
 * lookups, reminder chip rendering, send-reminder/delete forms) and just
 * hands those nodes in as `children`. We only need the client boundary
 * for the edit-toggle state.
 */
export default function EditableEventRow({
  event,
  artistSlug,
  children,
}: {
  event: EditableEvent;
  artistSlug: string;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const hasCoords = typeof event.lat === "number" && typeof event.lng === "number";
  const hasCity = Boolean(event.city?.trim());

  return (
    <div className="rounded-2xl bg-black/40 p-3">
      {children}

      {/* 0090 venue location status — distance on fan cards needs lat/lng. */}
      {(hasCity || hasCoords) && (
        <p className="mt-1 text-[11px] text-white/50">
          📍 {hasCity ? `${event.city}${event.region ? `, ${event.region}` : ""}` : "Coordinates set"}
          {hasCoords ? (
            <span className="ml-1 text-white/35">
              ({event.lat?.toFixed(3)}, {event.lng?.toFixed(3)})
            </span>
          ) : (
            <span className="ml-1 text-amber-300/80">(unresolved — add coordinates)</span>
          )}
        </p>
      )}

      {/* Edit affordance — sits at the bottom of the read-only row, parallel
          to the existing "View RSVPs" details summary. Hidden while the form
          is open since the form itself has its own Cancel button. */}
      {!editing && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex text-xs text-white/60 hover:text-white"
          >
            ✏️ Edit
          </button>
          <a
            href={`/admin/artists/${artistSlug}/events/${event.id}/match`}
            className="inline-flex text-xs text-white/60 hover:text-white"
          >
            🎯 Match preview
          </a>
        </div>
      )}

      {editing && (
        <EditEventForm
          event={event}
          artistSlug={artistSlug}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
