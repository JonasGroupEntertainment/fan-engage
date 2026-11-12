"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatPointsToast, type NextTier } from "@/lib/points/progress";

type State =
  | "loading"
  | "success"
  | "already"
  | "error"
  | "unauthenticated"
  | "token_required"
  | "token_expired";

/** Query parameter carrying the signed token (lib/checkin-token.ts CHECKIN_TOKEN_PARAM). */
const TOKEN_PARAM = "t";

function CheckinFlow() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get(TOKEN_PARAM) ?? "";
  const [state, setState] = useState<State>("loading");
  const [points, setPoints] = useState(0);
  /** "+25 pts · N to Gold" from the API's progress payload (lib/points/progress.ts). */
  const [progressLine, setProgressLine] = useState<string | null>(null);

  useEffect(() => {
    async function doCheckin() {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_slug: slug, token: token || undefined }),
      });
      if (res.status === 401) { setState("unauthenticated"); return; }
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        setState(data?.error === "expired_code" ? "token_expired" : "token_required");
        return;
      }
      if (!res.ok) { setState("error"); return; }
      const data = await res.json();
      if (data.alreadyCheckedIn) {
        setState("already");
      } else {
        setPoints(data.pointsAwarded);
        setProgressLine(
          formatPointsToast({
            pointsAwarded: Number(data.pointsAwarded) || 0,
            lifetimePoints: Number(data.lifetimePoints) || 0,
            nextTier: (data.nextTier as NextTier | null) ?? null,
          }),
        );
        setState("success");
      }
    }
    doCheckin();
  }, [slug, token]);

  const nextPath = `/artists/${slug}/checkin${token ? `?${TOKEN_PARAM}=${encodeURIComponent(token)}` : ""}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {state === "loading" && (
        <p className="text-white/60 animate-pulse">Checking you in…</p>
      )}

      {state === "success" && (
        <div className="space-y-4">
          <p className="text-5xl">✅</p>
          <h1 className="text-2xl font-semibold">Checked in!</h1>
          <p className="text-white/60">+{points} points added to your account.</p>
          {progressLine && (
            <p
              role="status"
              className="inline-block rounded-full border border-aurora/30 bg-aurora/10 px-4 py-1.5 text-sm font-semibold text-white"
            >
              {progressLine}
            </p>
          )}
          <button
            onClick={() => router.push(`/artists/${slug}`)}
            className="mt-4 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold"
          >
            Back to artist page
          </button>
        </div>
      )}

      {state === "already" && (
        <div className="space-y-4">
          <p className="text-5xl">👋</p>
          <h1 className="text-2xl font-semibold">Already checked in today</h1>
          <p className="text-white/60">Come back tomorrow for more points.</p>
          <button
            onClick={() => router.push(`/artists/${slug}`)}
            className="mt-4 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/70 hover:bg-white/5"
          >
            Back to artist page
          </button>
        </div>
      )}

      {state === "unauthenticated" && (
        <div className="space-y-4">
          <p className="text-5xl">🔒</p>
          <h1 className="text-2xl font-semibold">Sign in to check in</h1>
          <button
            onClick={() => router.push(`/login?next=${encodeURIComponent(nextPath)}`)}
            className="mt-4 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold"
          >
            Sign in
          </button>
        </div>
      )}

      {state === "token_required" && (
        <div className="space-y-4">
          <p className="text-5xl">📷</p>
          <h1 className="text-2xl font-semibold">Scan the QR at the venue</h1>
          <p className="text-white/60">
            Check-ins only count from the live QR code at the merch table or entrance.
          </p>
          <button
            onClick={() => router.push(`/artists/${slug}`)}
            className="mt-4 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/70 hover:bg-white/5"
          >
            Back to artist page
          </button>
        </div>
      )}

      {state === "token_expired" && (
        <div className="space-y-4">
          <p className="text-5xl">⏱️</p>
          <h1 className="text-2xl font-semibold">That code has expired</h1>
          <p className="text-white/60">
            The QR refreshes every few minutes. Scan the live code at the venue again.
          </p>
          <button
            onClick={() => router.push(`/artists/${slug}`)}
            className="mt-4 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/70 hover:bg-white/5"
          >
            Back to artist page
          </button>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-4">
          <p className="text-5xl">⚠️</p>
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-white/60">Please try again or visit the artist page.</p>
          <button
            onClick={() => router.push(`/artists/${slug}`)}
            className="mt-4 rounded-full border border-white/20 px-6 py-3 text-sm font-medium"
          >
            Back to artist page
          </button>
        </div>
      )}
    </main>
  );
}

export default function CheckinPage() {
  // useSearchParams needs a Suspense boundary so the shell can prerender.
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-white/60 animate-pulse">Checking you in…</p>
        </main>
      }
    >
      <CheckinFlow />
    </Suspense>
  );
}
