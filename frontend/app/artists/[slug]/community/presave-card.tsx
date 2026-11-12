"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import PointsToastHost, { pushPointsToast } from "@/components/points-toast";
import { PRESAVE_HONEST_COPY } from "@/lib/presave/core";
import type { PresaveCardRow } from "@/lib/presave/read";
import { completePresaveAction } from "@/lib/presave/actions";

/**
 * "Pre-save <title>" card. Opens the DSP / linkfire URL in a new tab and, in
 * the same click, records the click-through + pays the thank-you points
 * (lib/presave/actions.ts), then shows the "+50 pts · N to Gold" toast.
 *
 * Mounts its own PointsToastHost so it works on the artist page, which has
 * no host of its own; on the community page the page-level host wins and
 * this one stays silent (components/points-toast.tsx).
 */
export default function PresaveCard({
  artistSlug,
  presaves,
  signedIn,
  signInHref,
  accentFrom,
  accentTo,
  embedded = false,
}: {
  artistSlug: string;
  presaves: PresaveCardRow[];
  signedIn: boolean;
  signInHref: string;
  accentFrom?: string | null;
  accentTo?: string | null;
  /** True inside FanCtaBlock — no outer section chrome. */
  embedded?: boolean;
}) {
  if (presaves.length === 0) return null;
  const from = accentFrom ?? "#7c3aed";
  const to = accentTo ?? "#fb923c";

  const items = (
    <div className="grid gap-3 md:grid-cols-2">
      {presaves.map((p) => (
        <PresaveItem
          key={p.id}
          artistSlug={artistSlug}
          presave={p}
          signedIn={signedIn}
          signInHref={signInHref}
          gradient={`linear-gradient(90deg, ${from}, ${to})`}
        />
      ))}
    </div>
  );

  if (embedded) {
    return (
      <>
        <PointsToastHost />
        {items}
      </>
    );
  }

  return (
    <section
      className="rounded-3xl border border-white/10 bg-black/30 p-6"
      style={{ borderColor: `${from}40` }}
    >
      <PointsToastHost />
      <p className="text-xs uppercase tracking-[0.3em] text-white/60">New music</p>
      <h2 className="mt-1 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        Pre-save and earn points
      </h2>
      <div className="mt-4">{items}</div>
    </section>
  );
}

function PresaveItem({
  artistSlug,
  presave,
  signedIn,
  signInHref,
  gradient,
}: {
  artistSlug: string;
  presave: PresaveCardRow;
  signedIn: boolean;
  signInHref: string;
  gradient: string;
}) {
  const [done, setDone] = useState(presave.completed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    // Open the DSP first — it must happen synchronously inside the click so
    // popup blockers treat it as user-initiated.
    window.open(presave.url, "_blank", "noopener,noreferrer");
    if (!signedIn || done) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("action_id", presave.id);
      fd.set("artist_slug", artistSlug);
      const res = await completePresaveAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      pushPointsToast(res);
    });
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        done ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-black/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
          🎵
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Pre-save {presave.title}</p>
          {presave.release_label && (
            <p className="mt-0.5 text-xs uppercase tracking-wide text-white/60">
              {presave.release_label}
            </p>
          )}
          {presave.description && (
            <p className="mt-1 text-xs text-white/70">{presave.description}</p>
          )}
          {presave.point_value > 0 && (
            <p className="mt-1 text-xs text-emerald-300">
              {done ? `+${presave.point_value} pts earned` : `+${presave.point_value} pts for clicking through`}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-white/50">{PRESAVE_HONEST_COPY}</p>
        {done ? (
          <button
            type="button"
            onClick={handleClick}
            className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/30"
          >
            ✓ Saved · open again ↗
          </button>
        ) : signedIn ? (
          <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundImage: gradient }}
          >
            {pending ? "Saving…" : `${presave.cta_label} ↗`}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClick}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Open ↗
            </button>
            <Link
              href={signInHref}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundImage: gradient }}
            >
              Sign in to earn points
            </Link>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
