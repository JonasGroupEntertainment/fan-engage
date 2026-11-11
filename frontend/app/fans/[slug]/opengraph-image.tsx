import { ImageResponse } from "next/og";
import { getFanProfileBySlug } from "@/lib/data/fan-profile";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Fan Experience profile on Fan Engage";

const TIER_COLORS: Record<string, { from: string; to: string; label: string }> = {
  bronze: { from: "#a16207", to: "#fbbf24", label: "Bronze" },
  silver: { from: "#94a3b8", to: "#e2e8f0", label: "Silver" },
  gold: { from: "#ca8a04", to: "#fde68a", label: "Gold" },
  platinum: { from: "#e0e7ff", to: "#c7d2fe", label: "Platinum" },
};

export default async function FanProfileOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const routeParams = await params;
  const profile = await getFanProfileBySlug(routeParams.slug).catch(() => null);

  const displayName = profile?.firstName ?? "Fan";
  const slug = profile?.profileSlug ?? routeParams.slug;
  const tier = TIER_COLORS[(profile?.tier ?? "bronze").toLowerCase()] ?? TIER_COLORS.bronze;
  const points = profile?.totalPoints ?? 0;
  const founderCount = profile?.founderBadges.length ?? 0;
  const founderForLine = profile?.founderBadges
    .slice(0, 3)
    .map((f) => f.communityName)
    .join(" · ");

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
              `radial-gradient(circle at 18% 12%, ${tier.from}aa, transparent 55%), ` +
              `radial-gradient(circle at 82% 90%, ${tier.to}aa, transparent 60%), ` +
              "linear-gradient(180deg, rgba(5,11,31,0.4), rgba(5,11,31,0.85))",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <div
            style={{
              display: "flex",
              width: 52, height: 52,
              alignItems: "center", justifyContent: "center",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${tier.from}, ${tier.to})`,
              fontSize: 22, fontWeight: 700,
            }}
          >
            FE
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, opacity: 0.85 }}>
            Fan Engage
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
          <div
            style={{
              fontSize: 24, fontWeight: 500,
              letterSpacing: "0.2em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {`${tier.label} tier · @${slug}`}
          </div>
          <div
            style={{
              fontSize: 110, fontWeight: 700, lineHeight: 0.98,
              letterSpacing: "-0.04em", maxWidth: 1040,
            }}
          >
            {`${displayName}’s fan experience profile`}
          </div>
          {founderCount > 0 ? (
            <div
              style={{
                display: "flex", fontSize: 28, fontWeight: 500,
                color: "rgba(255,255,255,0.88)", marginTop: 6,
              }}
            >
              {`🌟 Founder · ${founderForLine}${founderCount > 3 ? ` · +${founderCount - 3} more` : ""}`}
            </div>
          ) : (
            <div
              style={{
                display: "flex", fontSize: 28, fontWeight: 500,
                color: "rgba(255,255,255,0.78)", marginTop: 6,
              }}
            >
              Following the artists they actually show up for.
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 22, color: "rgba(255,255,255,0.85)", position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 40, fontWeight: 700 }}>{points.toLocaleString()}</span>
            <span style={{ fontSize: 22, opacity: 0.7 }}>points earned</span>
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 22px", borderRadius: 999,
              background: `linear-gradient(135deg, ${tier.from}, ${tier.to})`,
              fontWeight: 600, color: "#050b1f",
            }}
          >
            Build yours →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
