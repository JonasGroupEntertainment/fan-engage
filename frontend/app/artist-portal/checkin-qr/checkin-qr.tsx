"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type MintResponse = {
  url: string;
  path: string;
  token: string | null;
  expiresAt: number | null;
  rotationSeconds: number;
  rotation: "on" | "off";
};

/**
 * Live check-in QR for the artist portal.
 *
 * With rotation on (CHECKIN_TOKEN_SECRET set) the token in the QR changes
 * every rotationSeconds (see lib/checkin-token.ts), so this component
 * re-fetches a freshly signed URL from /api/admin/checkin-token every
 * rotationSeconds / 2 — always before the current one expires — and shows
 * a countdown. With rotation off the URL is static and safe to print.
 *
 * The server page passes the first URL so the QR renders on first paint.
 */
export default function CheckinQr({
  artistSlug,
  artistName,
  initialUrl,
  initialExpiresAt,
  rotationSeconds,
  rotation,
}: {
  artistSlug: string;
  artistName: string;
  initialUrl: string;
  initialExpiresAt: number | null;
  rotationSeconds: number;
  rotation: "on" | "off";
}) {
  const [url, setUrl] = useState(initialUrl);
  const [expiresAt, setExpiresAt] = useState<number | null>(initialExpiresAt);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Refresh cadence: half the rotation window, so the displayed code is
  // never older than half a bucket and always inside the grace window.
  const refreshMs = (rotationSeconds * 1000) / 2;
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/checkin-token?artist=${encodeURIComponent(artistSlug)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MintResponse;
      setUrl(data.url);
      setExpiresAt(data.expiresAt);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setNextRefreshAt(Date.now() + refreshMs);
    }
  }, [artistSlug, refreshMs]);

  // Fetch a fresh code right after mount and every refreshMs while rotation
  // is on. State is only set from the timer callbacks (after the fetch).
  useEffect(() => {
    if (rotation === "off") return;
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh, refreshMs, rotation]);

  // One-second clock for the countdown.
  useEffect(() => {
    if (rotation === "off") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rotation]);

  const countdown =
    rotation === "on" && nextRefreshAt !== null && now !== null
      ? formatCountdown(nextRefreshAt - now)
      : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-white">Venue check-in QR</p>
        {countdown && (
          <p className="text-xs tabular-nums text-white/70" aria-live="polite">
            Refreshes in {countdown}
          </p>
        )}
      </div>
      <p className="text-xs text-white/60">
        Display this at the merch table or entrance. Fans scan to earn{" "}
        <strong className="text-white">25 points</strong> per visit (once per day).
      </p>
      <div className="flex justify-center">
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={220} bgColor="#ffffff" fgColor="#050b1f" level="M" />
        </div>
      </div>
      <p className="text-center text-xs text-white/60 font-mono break-all">{url}</p>
      <p className="text-center text-xs font-semibold text-white/70">
        Scan to check in to {artistName}
      </p>
      {rotation === "on" ? (
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          <span className="font-semibold text-white/80">Print this page?</span> The code
          changes every {Math.round(rotationSeconds / 60)} minutes, so a printed copy stops
          working within about {Math.round(rotationSeconds / 30)} minutes. Keep this page open
          on a screen at the venue instead.
          {expiresAt !== null && now !== null && (
            <> Current code is live until {new Date(expiresAt).toLocaleTimeString()}.</>
          )}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-white/60">
            Rotation is off: this code is static and safe to print.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10 transition"
          >
            🖨 Print QR card
          </button>
        </div>
      )}
      {fetchError && (
        <p className="text-xs text-ember" role="status">
          Could not refresh the code ({fetchError}). Showing the last one; it will retry.
        </p>
      )}
    </section>
  );
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
