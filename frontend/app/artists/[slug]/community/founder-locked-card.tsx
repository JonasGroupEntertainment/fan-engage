import Link from "next/link";
import { FOUNDER_LOCKED_COPY } from "@/lib/founder-gate/core";

/**
 * Locked card for a founder-only post the viewer cannot read. Shows the
 * title (if any) and nothing else — the body never reaches this component
 * (app/artists/[slug]/community/founder-gate.ts). Founder spots are free
 * and capped, so the door is the Founding Fans page, not /premium.
 */
export default function FounderLockedCard({
  title,
  artistName,
  foundersHref,
  accentFrom,
  accentTo,
}: {
  title: string | null;
  artistName: string;
  foundersHref: string;
  accentFrom?: string | null;
  accentTo?: string | null;
}) {
  const from = accentFrom ?? "#f59e0b";
  const to = accentTo ?? "#fbbf24";
  return (
    <section
      className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-black/40 px-4 py-3"
      aria-label={`${FOUNDER_LOCKED_COPY.headline}: ${title ?? "a post"}`}
    >
      <span
        className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-base"
        style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
        aria-hidden
      >
        👑
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {FOUNDER_LOCKED_COPY.headline}
          {title ? <span className="font-normal text-white/70"> · “{title}”</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-white/55">
          {artistName} posted this for the first 100 Founding Fans. The spots are free and earned, not sold.
        </p>
      </div>
      <Link
        href={foundersHref}
        className="flex-none rounded-full border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10"
      >
        {FOUNDER_LOCKED_COPY.cta}
      </Link>
    </section>
  );
}
