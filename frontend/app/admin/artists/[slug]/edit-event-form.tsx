"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { updateEventAction } from "../actions";

/**
 * Subset of the artist_events row that the edit form needs to pre-fill.
 * Imported by both this form and the EditableEventRow wrapper so the row's
 * server-side query and the form's expected props stay in sync.
 */
export interface EditableEvent {
  id: string;
  title: string;
  detail: string | null;
  event_date: string | null;
  starts_at: string | null;
  location: string | null;
  url: string | null;
  capacity: number | null;
  sort_order: number;
  active: boolean;
  rsvp_opens_at?: string | null;
}

/**
 * Inline edit form rendered below an event row in /admin/artists/[slug].
 * Mirrors CreateEventForm's field layout and adds an `active` toggle so
 * admins can hide an event without deleting. Wrapped in useFormSave for
 * retry-on-503 + visible status; refreshes the page on success and
 * collapses back to the read-only row via onCancel.
 */
export default function EditEventForm({
  event,
  artistSlug,
  onCancel,
}: {
  event: EditableEvent;
  artistSlug: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({
    onSuccess: () => {
      router.refresh();
      // Collapse the form once the row has saved + the page has refreshed
      // so admins see the updated read-only row in place.
      onCancel();
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessError(null);
    const fd = new FormData(e.currentTarget);
    const result = await submit(updateEventAction, fd);
    if (result?.error) {
      setBusinessError(result.error);
    }
  }

  // <input type="datetime-local"> needs `YYYY-MM-DDTHH:mm` (no seconds, no
  // timezone suffix). The DB stores starts_at as a full ISO timestamptz,
  // so we slice it down. If starts_at is null, leave the field empty.
  const startsAtLocal = event.starts_at
    ? new Date(event.starts_at).toISOString().slice(0, 16)
    : "";
  const rsvpOpensLocal = event.rsvp_opens_at
    ? new Date(event.rsvp_opens_at).toISOString().slice(0, 16)
    : "";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 md:grid-cols-2"
    >
      <input type="hidden" name="event_id" value={event.id} />
      <input type="hidden" name="artist_slug" value={artistSlug} />

      <input
        name="title"
        required
        defaultValue={event.title}
        placeholder="Event title"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm md:col-span-2"
      />
      <input
        name="starts_at"
        type="datetime-local"
        defaultValue={startsAtLocal}
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="event_date"
        defaultValue={event.event_date ?? ""}
        placeholder="Display date (Mar 14 · 7 PM)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="location"
        defaultValue={event.location ?? ""}
        placeholder="Location (Nashville, TN)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="detail"
        defaultValue={event.detail ?? ""}
        placeholder="Detail (Fan Engage members only)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="url"
        defaultValue={event.url ?? ""}
        placeholder="URL (ticket link / livestream)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="capacity"
        type="number"
        defaultValue={event.capacity ?? ""}
        placeholder="Capacity (blank = unlimited)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <label className="text-xs text-white/70 md:col-span-2">
        RSVP opens for everyone (UTC)
        <input
          name="rsvp_opens_at"
          type="datetime-local"
          defaultValue={rsvpOpensLocal}
          className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
        <span className="mt-1 block text-[11px] text-white/45">
          Founding Fans can RSVP 48 hours earlier. Leave blank to keep RSVP open now.
          Same clock as the start time field. Fans see the time in Eastern.
        </span>
      </label>
      <input
        name="sort_order"
        type="number"
        defaultValue={event.sort_order}
        placeholder="Sort order"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-xs text-white/80 md:col-span-2">
        <input
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={event.active}
        />
        Active (visible to fans)
      </label>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-white/60 hover:text-white"
        >
          Cancel
        </button>
        <SaveStatusIndicator status={status} />
        {businessError && (
          <span className="text-xs text-rose-300" title={businessError}>
            ✗ {businessError}
          </span>
        )}
      </div>
    </form>
  );
}
