import Link from "next/link";
import { requirePortalPage } from "@/lib/artist-portal/access";
import { loadReadiness } from "@/lib/launch/data";
import type { ReadinessItem } from "@/lib/launch/readiness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Launch · Artist Portal" };

/**
 * In-portal launch checklist. Read-only (viewer and above): every item is
 * computed from live data by lib/launch/data.ts and scored by
 * lib/launch/readiness.ts; each row links to the page that fixes it.
 */
export default async function ArtistPortalLaunchPage() {
  const ctx = await requirePortalPage("launch", "/artist-portal/launch");
  const readiness = await loadReadiness(ctx.communityId);

  const required = readiness.items.filter((i) => i.kind === "required");
  const optional = readiness.items.filter((i) => i.kind === "optional");
  const info = readiness.items.filter((i) => i.kind === "info");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Launch checklist
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Everything fans will see on day one, checked against your live data.
          </p>
        </div>
        {readiness.ready ? (
          <span className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-sm font-semibold text-emerald-300">
            Ready to launch
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/15 px-4 py-1.5 text-sm font-semibold text-amber-300">
            {readiness.requiredTotal - readiness.requiredDone} to go
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>
            {readiness.requiredDone} of {readiness.requiredTotal} required items done
          </span>
          <span className="tabular-nums">{readiness.percent}%</span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={readiness.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full ${
              readiness.ready
                ? "bg-emerald-400"
                : "bg-gradient-to-r from-aurora to-ember"
            }`}
            style={{ width: `${readiness.percent}%` }}
          />
        </div>
      </div>

      <Section title="Required" items={required} />
      <Section title="Nice to have" items={optional} />
      <Section title="Signals" items={info} subtle />
    </div>
  );
}

function Section({
  title,
  items,
  subtle,
}: {
  title: string;
  items: ReadinessItem[];
  subtle?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">{title}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  item.done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : subtle
                      ? "bg-white/5 text-white/30"
                      : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {item.done ? "✓" : "○"}
              </span>
              <div className="min-w-0">
                <p className={`text-sm ${item.done ? "text-white/80" : "text-white"}`}>
                  {item.label}
                </p>
                <p className="text-xs text-white/45">{item.detail}</p>
              </div>
            </div>
            <Link
              href={item.href}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                item.done
                  ? "border-white/10 text-white/50 hover:border-white/20 hover:text-white"
                  : "border-purple-500/40 text-purple-200 hover:border-purple-400 hover:text-white"
              }`}
            >
              {item.done ? "Open" : "Fix"} →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
