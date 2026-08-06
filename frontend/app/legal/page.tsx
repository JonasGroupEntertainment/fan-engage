import type { Metadata } from "next";
import Link from "next/link";
import { listPolicies } from "@/lib/data/policies";

export const metadata: Metadata = {
  title: "Legal & Privacy",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PolicyCard {
  icon: string;
  title: string;
  description: string;
  href: string;
  isDraft: boolean;
}

const policyCards: Record<string, Omit<PolicyCard, "isDraft">> = {
  privacy: {
    icon: "🛡️",
    title: "Privacy Policy",
    description: "How Fan Engage collects, uses, and protects your personal information.",
    href: "/privacy",
  },
  terms: {
    icon: "📜",
    title: "Terms of Service",
    description: "The agreement between you and Fan Engage covering how you use the platform.",
    href: "/terms",
  },
  cookie_policy: {
    icon: "🍪",
    title: "Cookie Policy",
    description: "Which cookies Fan Engage sets and what they're used for.",
    href: "/cookie-policy",
  },
  cancellation_refund: {
    icon: "💳",
    title: "Cancellation & Refund",
    description: "How subscription cancellations and refunds work.",
    href: "/cancellation-refund",
  },
};

export default async function LegalPage() {
  const policies = await listPolicies();
  const policyMap = new Map(policies.map((p) => [p.slug, p]));

  const cards: PolicyCard[] = [
    {
      ...policyCards.privacy,
      isDraft: policyMap.get("privacy")?.is_draft ?? false,
    },
    {
      ...policyCards.terms,
      isDraft: policyMap.get("terms")?.is_draft ?? false,
    },
    {
      ...policyCards.cookie_policy,
      isDraft: policyMap.get("cookie_policy")?.is_draft ?? false,
    },
    {
      ...policyCards.cancellation_refund,
      isDraft: policyMap.get("cancellation_refund")?.is_draft ?? false,
    },
    {
      icon: "🔒",
      title: "Trust Center",
      description: "Security certifications, audits, and subprocessor list.",
      href: "#",
      isDraft: false,
    },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-12">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">Legal & Privacy</h1>
        <p className="text-white/60">
          Fan Engage is committed to transparent policies. Review the documents below.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const isComingSoon = card.href === "#";
          return (
            <div
              key={card.title}
              className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all hover:border-white/20 hover:bg-white/10"
            >
              {/* Draft Badge */}
              {card.isDraft && (
                <div className="absolute right-4 top-4">
                  <span className="inline-block rounded-full bg-white/10 px-2 py-1 text-xs font-medium text-white/65 border border-white/20">
                    Being finalized
                  </span>
                </div>
              )}

              {/* Icon & Title */}
              <div className="flex items-start gap-3">
                <span className="text-2xl">{card.icon}</span>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">{card.title}</h2>
                </div>
              </div>

              {/* Description */}
              <p className="mt-3 text-sm text-white/60">{card.description}</p>

              {/* Link / Coming Soon */}
              <div className="mt-4">
                {isComingSoon ? (
                  <span className="inline-block rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50">
                    Coming soon
                  </span>
                ) : (
                  <Link
                    href={card.href}
                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition-all hover:bg-white/20 hover:text-white"
                  >
                    Review →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
