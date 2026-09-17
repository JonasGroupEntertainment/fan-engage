"use client";

import Link from "next/link";
import { PREMIUM_CTA, premiumPath } from "@/lib/entitlements-core";

type CopyKey = "available" | "unlock" | "upgrade";

interface PremiumCtaProps {
  /** Which locked string to render as the link label. */
  copy?: CopyKey;
  /** Optional community slug — appended as ?c= so checkout stays scoped. */
  communityId?: string | null;
  className?: string;
  /** Compact chip vs a full-width button. */
  variant?: "link" | "button" | "chip";
}

const COPY: Record<CopyKey, string> = {
  available: PREMIUM_CTA.available,
  unlock: PREMIUM_CTA.unlock,
  upgrade: PREMIUM_CTA.upgrade,
};

/**
 * Canonical Premium upgrade control. Always points at /premium.
 * "Manage billing" lives on billing surfaces and is not rendered here.
 */
export default function PremiumCta({
  copy = "upgrade",
  communityId,
  className,
  variant = "button",
}: PremiumCtaProps) {
  const href = premiumPath(communityId);
  const label = COPY[copy];

  if (variant === "link") {
    return (
      <Link
        href={href}
        className={
          className ??
          "text-sm font-semibold text-white underline-offset-2 hover:underline"
        }
      >
        {label}
      </Link>
    );
  }

  if (variant === "chip") {
    return (
      <Link
        href={href}
        className={
          className ??
          "inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/85 hover:bg-white/10"
        }
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={
        className ??
        "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
      }
    >
      {label}
    </Link>
  );
}

export function PremiumLockNote({
  communityId,
  feature,
}: {
  communityId?: string | null;
  feature?: string;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/55">
        {PREMIUM_CTA.available}
      </p>
      <p className="text-sm text-white/80">
        {feature
          ? `${feature} — ${PREMIUM_CTA.unlock}`
          : PREMIUM_CTA.unlock}
      </p>
      <PremiumCta copy="upgrade" communityId={communityId} />
    </div>
  );
}
