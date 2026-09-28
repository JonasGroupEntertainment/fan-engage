import { ImageResponse } from "next/og";
import { getArtistFromDb } from "@/lib/data/artists";

// ─── Founder share card OG ──────────────────────────────────────────────
// "I'm Founder #N for <Artist>" certificate-style card. Generated when a
// fan shares /share/founder/<slug>/<number> — the URL becomes a beautiful
// preview in iMessage/Slack/Twitter. 1200x630.

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const alt = "Founder badge on Fan Engage";

export default async function FounderOpengraphImage({
  params,
}: {
  params: { slug: string; number: string };
}) {
  const artist = await getArtistFromDb(params.slug).catch(() => null);
  const number = parseInt(params.number, 10);

  const artistName = artist?.name ?? "Fan Engage";
  const accentFrom = artist?.accentFrom ?? "#7c3aed";
  const accentTo = artist?.accentTo ?? "#fb923c";
  const founderNumber = Number.isFinite(number) && number > 0 ? number : 1;

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
        {/* Brand accent — strong corner glow in the artist's colors. */}
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

        {/* Decorative ring frame to give it a "certificate" feel. */}
        <div
          style={{
            position: "absolute",
            inset: 32,
            display: "flex",
            border: "2px solid rgba(255,255,255,0.18)",
            borderRadius: 28,
          }}
        />

        {/* Top — Fan Engage brand pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            position: "relative",
          }}
        >
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
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              opacity: 0.85,
            }}
          >
            Fan Engage
          </div>
        </div>

        {/* Center — the big moment */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
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
            Founding Fan
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 220,
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: "-0.05em",
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            #{founderNumber}
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: 1000,
              color: "white",
              marginTop: 4,
            }}
          >
            for {artistName}
          </div>
        </div>

        {/* Bottom — caption + URL hint */}
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
            One of 100 founding fans. 1.5x points and a numbered badge. Founder drops coming soon.
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
            Claim yours →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
