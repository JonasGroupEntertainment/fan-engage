"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { createEventAction } from "../actions";

/**
 * "Add event" form rendered at the bottom of /admin/artists/[slug].
 * Wrapped in useFormSave for retry-on-503 + visible status, refreshes the
 * page on success so the new event appears in the list above without a
 * full reload.
 */
export default function CreateEventForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({
    onSuccess: () => router.refresh(),
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessError(null);
    const fd = new FormData(e.currentTarget);
    const result = await submit(createEventAction, fd);
    if (result?.success) {
      // Reset the form so admin can quickly add another event.
      e.currentTarget.reset();
    } else if (result?.error) {
      setBusinessError(result.error);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-2 md:grid-cols-2"
    >
      <input type="hidden" name="artist_slug" value={slug} />
      <input
        name="title"
        required
        placeholder="Event title"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="starts_at"
        type="datetime-local"
        placeholder="Start date/time"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="event_date"
        placeholder="Display date (Mar 14 · 7 PM)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="location"
        placeholder="Location (Nashville, TN)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="city"
        placeholder="Venue city (Austin)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="region"
        placeholder="State (TX)"
        maxLength={20}
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm uppercase"
      />
      <input
        name="lat"
        type="number"
        step="any"
        placeholder="Latitude (blank = resolve from city)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="lng"
        type="number"
        step="any"
        placeholder="Longitude (blank = resolve from city)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <p className="text-[11px] text-white/45 md:col-span-2">
        City + state power &ldquo;Near you&rdquo; and the distance on fan event cards. Leave
        latitude/longitude blank to resolve them from the city table on save; the row says
        &ldquo;unresolved&rdquo; when the city is not in the table.
      </p>
      <input
        name="detail"
        placeholder="Detail (Fan Engage members only)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="url"
        placeholder="URL (ticket link / livestream)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="capacity"
        type="number"
        placeholder="Capacity (blank = unlimited)"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <label className="text-xs text-white/70 md:col-span-2">
        RSVP opens for everyone (UTC)
        <input
          name="rsvp_opens_at"
          type="datetime-local"
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
        defaultValue="0"
        placeholder="Sort order"
        className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "+ Add event"}
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
