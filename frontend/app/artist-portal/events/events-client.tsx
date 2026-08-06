"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import {
  createPortalEventAction,
  updatePortalEventAction,
  deletePortalEventAction,
} from "./actions";

interface Event {
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
}

const inputCls =
  "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500";

function EventForm({
  artistSlug,
  event,
  onDone,
}: {
  artistSlug: string;
  event?: Event;
  onDone: () => void;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({
    onSuccess: () => { router.refresh(); onDone(); },
  });

  const startsAtLocal = event?.starts_at
    ? new Date(event.starts_at).toISOString().slice(0, 16)
    : "";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const action = event ? updatePortalEventAction : createPortalEventAction;
    const result = await submit(action, fd);
    if (result?.error) setErr(result.error);
    else if (!event) e.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 md:grid-cols-2">
      {event && <input type="hidden" name="event_id" value={event.id} />}
      <input type="hidden" name="artist_slug" value={artistSlug} />

      <input
        name="title"
        required
        defaultValue={event?.title ?? ""}
        placeholder="Event title *"
        className={`${inputCls} md:col-span-2`}
      />
      <input
        name="starts_at"
        type="datetime-local"
        defaultValue={startsAtLocal}
        className={inputCls}
      />
      <input
        name="event_date"
        defaultValue={event?.event_date ?? ""}
        placeholder="Display date (e.g. Mar 14 · 7 PM)"
        className={inputCls}
      />
      <input
        name="location"
        defaultValue={event?.location ?? ""}
        placeholder="Location"
        className={inputCls}
      />
      <input
        name="detail"
        defaultValue={event?.detail ?? ""}
        placeholder="Detail (e.g. Members only)"
        className={inputCls}
      />
      <input
        name="url"
        defaultValue={event?.url ?? ""}
        placeholder="Ticket / livestream URL"
        className={`${inputCls} md:col-span-2`}
      />
      <input
        name="capacity"
        type="number"
        defaultValue={event?.capacity ?? ""}
        placeholder="Capacity (blank = unlimited)"
        className={inputCls}
      />
      {event && (
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={event.active}
            className="accent-purple-500"
          />
          Active (visible to fans)
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : event ? "Save changes" : "+ Add event"}
        </button>
        {event && (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-white/50 hover:text-white"
          >
            Cancel
          </button>
        )}
        <SaveStatusIndicator status={status} />
        {err && <span className="text-xs text-rose-300">✗ {err}</span>}
      </div>
    </form>
  );
}

function EventRow({
  event,
  rsvpCount,
  artistSlug,
}: {
  event: Event;
  rsvpCount: number;
  artistSlug: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    const fd = new FormData();
    fd.set("event_id", event.id);
    await deletePortalEventAction(fd);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      {editing ? (
        <EventForm
          artistSlug={artistSlug}
          event={event}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-white leading-tight">{event.title}</p>
              {!event.active && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                  Hidden
                </span>
              )}
            </div>
            {event.event_date && (
              <p className="mt-1 text-sm text-white/60">{event.event_date}</p>
            )}
            {event.location && (
              <p className="text-xs text-white/50">{event.location}</p>
            )}
            <p className="mt-2 text-xs text-purple-300">
              {rsvpCount} RSVP{rsvpCount !== 1 ? "s" : ""}
              {event.capacity ? ` / ${event.capacity} capacity` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:border-white/20 hover:text-white transition-colors"
            >
              Edit
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-300">Delete?</span>
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/30"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-white/50 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:border-rose-500/30 hover:text-rose-300 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EventsClient({
  events,
  rsvpCounts,
  artistSlug,
}: {
  events: Event[];
  rsvpCounts: Record<string, number>;
  artistSlug: string;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Events
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white"
        >
          {showCreate ? "Cancel" : "+ New event"}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="mb-4 text-sm font-medium text-white/70">New event</p>
          <EventForm
            artistSlug={artistSlug}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}

      {events.length === 0 && !showCreate && (
        <div className="rounded-2xl border border-white/10 bg-black/20 py-16 text-center text-white/50">
          No events yet. Add your first one above.
        </div>
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            rsvpCount={rsvpCounts[event.id] ?? 0}
            artistSlug={artistSlug}
          />
        ))}
      </div>
    </div>
  );
}
