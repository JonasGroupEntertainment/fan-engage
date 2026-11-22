import Link from "next/link";
import { pickNextStep, type NextStepInput } from "@/lib/next-step";

const FULL_PERCENT = 100;

/**
 * "Your next step": the one goal a fan is closest to, with a progress bar,
 * near the top of Fan Home. Which goal, and what is said about it, is
 * decided by lib/next-step.ts. Renders nothing when there is nothing
 * honest to say.
 */
export default function NextStepCard(props: NextStepInput) {
  const step = pickNextStep(props);
  if (!step) return null;
  const ready = step.kind === "reward_ready";

  return (
    <section className="glass-card space-y-3 rounded-2xl p-5" data-next-step={step.kind}>
      <p className="text-xs uppercase tracking-[0.25em] text-white/60">{step.eyebrow}</p>
      <p className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
        {step.title}
      </p>
      <div
        role="progressbar"
        aria-label={`Progress toward ${step.title}`}
        aria-valuemin={0}
        aria-valuemax={FULL_PERCENT}
        aria-valuenow={step.percent}
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
          style={{ width: `${step.percent}%` }}
        />
      </div>
      <p className="text-sm text-white/80">{step.line}</p>
      <Link
        href={step.href}
        className={
          ready
            ? "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            : "inline-block text-sm font-medium text-white underline underline-offset-2 hover:text-white/80"
        }
      >
        {step.cta} →
      </Link>
    </section>
  );
}
