import { ImageResponse } from "next/og";
import { getArtistFromDb } from "@/lib/data/artists";
import { getShareableReward } from "@/lib/data/reward-share";
import { pointsLabel } from "@/lib/reward-share";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Fan reward on Fan Engage";

// Ten minutes, not the long default, so our own copy of a picture stops
// naming a reward soon after it is switched off. A copy that Facebook or a
// phone already saved cannot be recalled.
const PICTURE_CACHE_CONTROL = "public, max-age=600, s-maxage=600";

export default async function RewardOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string; reward: string }>;
}) {
  const routeParams = await params;
  const [artist, reward] = await Promise.all([
    getArtistFromDb(routeParams.slug).catch(() => null),
    getShareableReward(routeParams.slug, routeParams.reward),
  ]);

  const artistName = artist?.name ?? "Fan Engage";
  const accentFrom = artist?.accentFrom ?? "#7c3aed";
  const accentTo = artist?.accentTo ?? "#fb923c";
  // A reward that may not be shown publicly gets a picture that names no reward.
  const headline = reward?.title ?? "Fan rewards";
  const detail = reward ? `${artistName} · ${pointsLabel(reward.point_cost)}` : artistName;

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
            top: 0, left: 0, right: 0, bottom: 0,
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
            top: 32, left: 32, right: 32, bottom: 32,
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
            gap: 18,
            position: "relative",
            textAlign: "center",
          }}
        >
          {/* Drawn as shapes: the built-in share-image font has no emoji. */}
          <svg width="110" height="110" viewBox="0 0 24 24">
            <defs>
              <linearGradient id="gift" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={accentFrom} />
                <stop offset="1" stopColor={accentTo} />
              </linearGradient>
            </defs>
            <rect x="3" y="10" width="18" height="11" rx="1.5" fill="url(#gift)" />
            <rect x="2" y="6.5" width="20" height="4" rx="1" fill="url(#gift)" />
            <rect x="10.75" y="6.5" width="2.5" height="14.5" fill="#050b1f" />
            <circle cx="9" cy="4.5" r="2" fill="none" stroke={accentFrom} strokeWidth="1.5" />
            <circle cx="15" cy="4.5" r="2" fill="none" stroke={accentTo} strokeWidth="1.5" />
          </svg>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Fan Reward
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: 900,
              color: "white",
            }}
          >
            {headline}
          </div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.8)" }}>{detail}</div>
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
            Join free. Earn points for showing up and taking part.
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
            Join →
          </div>
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": PICTURE_CACHE_CONTROL } },
  );
}
