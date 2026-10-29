import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { listEventsForAdmin } from "@/lib/data/artists";
import { listRsvpsForEvent } from "@/lib/data/events";
import ArtistEditForm from "./edit-form";
import CreateEventForm from "./create-event-form";
import EditableEventRow from "./editable-event-row";
import CheckinQr from "@/app/artist-portal/checkin-qr/checkin-qr";
import { mintCheckinToken } from "@/lib/checkin-token";
import { APP_URL } from "@/lib/app-url";
import {
  deleteEventAction,
  sendReminderNowAction,
} from "../actions";
import { formatRsvpOpensAt } from "@/lib/rsvp-window";
import ModerationButton from "@/app/admin/community/moderation-button";

type ReminderRow = {
  event_id: string;
  kind: string;
  sent_at: string;
  recipients_sms: number;
  recipients_email: number;
  error: string | null;
};

export const dynamic = "force-dynamic";

export default async function AdminArtistEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: artist } = await admin
    .from("artists")
    .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order")
    .eq("slug", slug)
    .maybeSingle();

  if (!artist) notFound();

  const events = await listEventsForAdmin(slug);

  const rsvpListsByEvent = await Promise.all(
    events.map((e) => listRsvpsForEvent(e.id)),
  );

  // Recent reminders for every event on this artist (for status chips)
  const eventIds = events.map((e) => e.id);
  const remindersByEvent = new Map<string, ReminderRow[]>();
  if (eventIds.length > 0) {
    const { data: reminders } = await admin
      .from("event_reminders")
      .select("event_id, kind, sent_at, recipients_sms, recipients_email, error")
      .in("event_id", eventIds)
      .order("sent_at", { ascending: false });
    for (const r of (reminders ?? []) as ReminderRow[]) {
      const arr = remindersByEvent.get(r.event_id) ?? [];
      arr.push(r);
      remindersByEvent.set(r.event_id, arr);
    }
  }

  const social = (artist.social ?? []) as Array<{ label: string; href: string }>;
  const socialText = social.map((s) => `${s.label}|${s.href}`).join("\n");
  const genresText = (artist.genres ?? []).join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/artists" className="text-xs text-white/60 hover:text-white">
            ← Back to artists
          </Link>
          <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Edit {artist.name as string}
          </h1>
          <p className="mt-1 text-xs text-white/60">/{artist.slug as string}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/artists/${artist.slug as string}/predictions`}
            className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            Predictions
          </Link>
          <Link
            href={`/artists/${artist.slug as string}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10"
          >
            View public page ↗
          </Link>
        </div>
      </div>

      <ArtistEditForm
        slug={artist.slug as string}
        initial={{
          name: (artist.name as string) ?? "",
          tagline: (artist.tagline as string | null) ?? "",
          bio: (artist.bio as string | null) ?? "",
          heroImage: (artist.hero_image as string | null) ?? null,
          heroFocalX: (artist.hero_focal_x as number | null) ?? 50,
          heroFocalY: (artist.hero_focal_y as number | null) ?? 50,
          accentFrom: (artist.accent_from as string) ?? "#7c3aed",
          accentTo: (artist.accent_to as string) ?? "#f97316",
          genresText,
          socialText,
          active: (artist.active as boolean) ?? true,
          sortOrder: (artist.sort_order as number) ?? 99,
        }}
      />

      {/* Events CRUD */}
      <section className="glass-card p-5">
        <p className="text-sm font-semibold">Upcoming events</p>
        <p className="mt-1 text-xs text-white/60">
          Shown on the artist page. Set <span className="text-white/80">active = false</span> to hide without deleting,
          or click ✏️ Edit on a row to change date, location, capacity, etc.
        </p>
        <div className="mt-3 space-y-3">
          {events.length === 0 && <p className="text-xs text-white/50">No events yet.</p>}
          {events.map((e, i) => {
            const rsvps = rsvpListsByEvent[i] ?? [];
            const atCap = e.capacity != null && e.capacity > 0 && rsvps.length >= e.capacity;
            const reminders = remindersByEvent.get(e.id) ?? [];
            const rem24 = reminders.find((r) => r.kind === "reminder_24h");
            const rem1h = reminders.find((r) => r.kind === "reminder_1h");
            const remindersScheduled =
              e.starts_at !== null && e.active && new Date(e.starts_at) > new Date();
            return (
              <EditableEventRow
                key={e.id}
                artistSlug={slug}
                event={{
                  id: e.id,
                  title: e.title,
                  detail: e.detail ?? null,
                  event_date: e.event_date ?? null,
                  starts_at: e.starts_at ?? null,
                  location: e.location ?? null,
                  url: e.url ?? null,
                  capacity: e.capacity ?? null,
                  sort_order: e.sort_order ?? 0,
                  active: e.active ?? true,
                  rsvp_opens_at: e.rsvp_opens_at ?? null,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {e.title}
                      {!e.active && (
                        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase text-white/50">
                          Inactive
                        </span>
                      )}
                      {atCap && (
                        <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs uppercase text-rose-200">
                          Full
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-white/60">
                      {e.detail ?? "—"} · {e.event_date ?? "—"}
                      {e.location ? ` · 📍 ${e.location}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      {rsvps.length}
                      {e.capacity ? ` / ${e.capacity}` : ""} RSVPed
                    </p>
                    {e.rsvp_opens_at && (
                      <p className="mt-1 text-xs text-white/50">
                        RSVP opens {formatRsvpOpensAt(new Date(e.rsvp_opens_at))}
                        {" · "}Founding Fans 48h earlier
                      </p>
                    )}
                    {/* Reminder status */}
                    {(rem24 || rem1h || remindersScheduled) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <ReminderChip label="24h" row={rem24} scheduled={remindersScheduled} />
                        <ReminderChip label="1h" row={rem1h} scheduled={remindersScheduled} />
                      </div>
                    )}
                    {e.url && <p className="mt-1 text-xs text-white/50 truncate">{e.url}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ModerationButton
                      action={sendReminderNowAction}
                      fields={{ event_id: e.id, artist_slug: slug }}
                      label="📣 Send reminder now"
                      variant="default"
                    />
                    <ModerationButton
                      action={deleteEventAction}
                      fields={{ event_id: e.id, artist_slug: slug }}
                      label="Delete"
                      variant="delete"
                      confirmMessage="Delete this event? This cannot be undone."
                    />
                  </div>
                </div>
                {rsvps.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-white/60 hover:text-white">
                      View RSVPs ({rsvps.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rsvps.map((r) => (
                        <Link
                          key={r.fan_id}
                          href={`/admin/fans/${r.fan_id}`}
                          className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                        >
                          {r.fan?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.fan.avatar_url as string}
                              alt=""
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-[8px] font-bold">
                              {(r.fan?.first_name?.[0] ?? "F").toUpperCase()}
                            </span>
                          )}
                          <span>{r.fan?.first_name ?? "Anonymous"}</span>
                        </Link>
                      ))}
                    </div>
                  </details>
                )}
              </EditableEventRow>
            );
          })}
        </div>

        <CreateEventForm slug={slug} />
      </section>

      {/* Check-in QR — print or display at the venue / merch table */}
      {/* Same live component as /artist-portal/checkin-qr: rotates when
          CHECKIN_TOKEN_SECRET is set, static (printable) when it is not.
          Super-admins may mint for any artist (api/admin/checkin-token). */}
      {(() => {
        const mint = mintCheckinToken(artist.slug as string);
        return (
          <section className="glass-card p-5">
            <CheckinQr
              artistSlug={artist.slug as string}
              artistName={artist.name as string}
              initialUrl={`${APP_URL}${mint.path}`}
              initialExpiresAt={mint.expiresAt}
              rotationSeconds={mint.rotationSeconds}
              rotation={mint.rotation}
            />
          </section>
        );
      })()}
    </div>
  );
}

function ReminderChip({
  label,
  row,
  scheduled,
}: {
  label: string;
  row: ReminderRow | undefined;
  scheduled: boolean;
}) {
  if (row) {
    if (row.error) {
      return (
        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-200">
          {label}: failed · {row.error.slice(0, 40)}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
        {label}: ✓ sent · {row.recipients_sms} sms · {row.recipients_email} email
      </span>
    );
  }
  if (!scheduled) return null;
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
      {label}: scheduled
    </span>
  );
}
