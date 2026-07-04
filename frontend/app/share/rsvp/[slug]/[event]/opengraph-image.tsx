import { ImageResponse } from "next/og";
import { getArtistFromDb } from "@/lib/data/artists";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RSVP confirmed on Fan Engage";

export default async function RsvpOpengraphImage({
  params,
}: {
  params: { slug: string; event: string };
}) {
  const [artist, eventRow] = await Promise.all([
    getArtistFromDb(params.slug).catch(() => null),
    (async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("artist_events")
        .select("title, detail, event_date, location")
        .eq("id", params.event)
        .maybeSingle();
      return data;
    })(),
  ]);

  const artistName = artist?.name ?? "Fan Engage";
  const accentFrom = artist?.accentFrom ?? "#7c3aed";
  const accentTo = artist?.accentTo ?? "#fb923c";
  const eventTitle = eventRow?.title ?? "Upcoming Event";
  const eventDate = eventRow?.event_date
    ? new Date(eventRow.event_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const location = eventRow?.location ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "70px",
          background: "#050b1f",
          color: "white",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              `radial-gradient(circle at 20% 15%, ${accentFrom}aa, transparent 55%), ` +
              `radial-gradient(circle at 80% 85%, ${accentTo}aa, transparent 60%), ` +
              "linear-gradient(180deg, rgba(5,11,31,0.4), rgba(5,11,31,0.85))",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 32,
            display: "flex",
            border: "2px solid rgba(255,255,255,0.18)",
            borderRadius: 28,
          }}
        />

        {/* Top — brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <div
            style={{
              display: "flex",
              width: 52,
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            FE
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", opacity: 0.85 }}>
            Fan Engage
          </div>
        </div>

        {/* Center */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            position: "relative",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            I&apos;m going
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: 1000,
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {eventTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {eventDate && (
              <div style={{ fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
                {eventDate}
              </div>
            )}
            {location && (
              <div style={{ fontSize: 24, color: "rgba(255,255,255,0.6)" }}>{location}</div>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "rgba(255,255,255,0.78)",
            position: "relative",
          }}
        >
          <div style={{ maxWidth: 720 }}>
            RSVP confirmed via Fan Engage — the {artistName} community app.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 22px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            Get tickets →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
