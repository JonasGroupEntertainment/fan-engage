import { ImageResponse } from "next/og";
import { getArtistFromDb } from "@/lib/data/artists";

// ─── Per-artist OG card ──────────────────────────────────────────────────
// Generated at request time so links to /artists/<slug> render with the
// artist's own brand: name + tagline laid over their accent gradient,
// with the hero photo as a watermarked background. 1200x630 — canonical
// Twitter/LinkedIn/Slack preview size.

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const alt = "Artist on Fan Engage";

export default async function ArtistOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const routeParams = await params;
  const artist = await getArtistFromDb(routeParams.slug).catch(() => null);

  // Fall back to a clean branded card if the slug doesn't resolve. We
  // never want a 500 on the OG endpoint — broken share previews are
  // worse than a generic one.
  const name = artist?.name ?? "Fan Engage";
  const tagline =
    artist?.tagline ?? "The fan experience platform built for fans who actually show up.";
  const accentFrom = artist?.accentFrom ?? "#7c3aed";
  const accentTo = artist?.accentTo ?? "#fb923c";
  const heroImage = artist?.heroImage ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "80px",
          background: "#050b1f",
          color: "white",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Hero image as background, dimmed. Wrapped in conditional so a
            missing hero gracefully falls back to gradient-only. */}
        {heroImage ? (
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              display: "flex",
              backgroundImage: `url(${heroImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              opacity: 0.55,
            }}
          />
        ) : null}

        {/* Brand accent overlay — pulls the artist's accent colors into a
            corner-to-corner radial wash that keeps text legible. */}
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex",
            background:
              `radial-gradient(circle at 15% 10%, ${accentFrom}cc, transparent 55%), ` +
              `radial-gradient(circle at 85% 95%, ${accentTo}cc, transparent 60%), ` +
              "linear-gradient(180deg, rgba(5,11,31,0.35), rgba(5,11,31,0.85))",
          }}
        />

        {/* Brand mark — top-left "FE" pill to anchor the design. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              fontSize: 24,
              fontWeight: 700,
              color: "white",
            }}
          >
            FE
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              opacity: 0.9,
            }}
          >
            Fan Engage
          </div>
        </div>

        {/* Headline block — artist name, then tagline. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Fan Experience
          </div>
          <div
            style={{
              fontSize: 110,
              fontWeight: 700,
              lineHeight: 0.98,
              letterSpacing: "-0.04em",
              maxWidth: 1040,
            }}
          >
            {name}
          </div>
          {tagline ? (
            <div
              style={{
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.25,
                letterSpacing: "-0.01em",
                maxWidth: 980,
                color: "rgba(255,255,255,0.92)",
                marginTop: 8,
              }}
            >
              {tagline}
            </div>
          ) : null}
        </div>

        {/* Footer row — "Join the Fan Experience" CTA pill. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "rgba(255,255,255,0.85)",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "flex",
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#10b981",
              }}
            />
            Live · Earn points · Unlock drops
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              fontWeight: 600,
              color: "white",
            }}
          >
            Join the Fan Experience →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
