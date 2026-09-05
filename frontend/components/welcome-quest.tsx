"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * First-visit celebration + starter quest, rendered on the artist page when
 * the fan lands with ?welcome=1 right after finishing onboarding.
 *
 * Dismissal is remembered per-artist in localStorage so the banner never
 * reappears on later visits even if the fan re-opens the welcome URL.
 */
export function WelcomeQuest({
  artistName,
  artistSlug,
  accentFrom,
  accentTo,
}: {
  artistName: string;
  artistSlug: string;
  accentFrom: string;
  accentTo: string;
}) {
  const storageKey = `fanengage_welcome_dismissed:${artistSlug}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (!localStorage.getItem(storageKey)) setVisible(true);
      } catch {
        setVisible(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [storageKey]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // localStorage unavailable — banner just reappears next welcome visit
    }
  };

  const quests = [
    {
      emoji: "💬",
      label: "Say hi in the community",
      points: 50,
      href: `/artists/${artistSlug}/community`,
    },
    {
      emoji: "📍",
      label: "Check in for today",
      points: 25,
      href: `/artists/${artistSlug}/checkin`,
    },
    {
      emoji: "🤝",
      label: "Invite a friend",
      points: 150,
      href: "/referrals",
    },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 p-6 md:p-8"
      style={{
        backgroundImage: `linear-gradient(135deg, ${accentFrom}2e, #0f172a 55%, #000000)`,
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-4 top-4 rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>

      <p className="text-xs uppercase tracking-[0.3em] text-white/70">
        Welcome to the inner circle
      </p>
      <h2
        className="mt-2 text-2xl font-semibold md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        🎉 You&apos;re in — and{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{ backgroundImage: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }}
        >
          100 points
        </span>{" "}
        are already yours
      </h2>
      <p className="mt-2 max-w-xl text-sm text-white/75">
        You&apos;re officially part of {artistName}&apos;s fan family. Knock out
        these three moves to stack points toward your first reward.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {quests.map((q) => (
          <Link
            key={q.label}
            href={q.href}
            className="group rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:border-white/30 hover:bg-white/5"
          >
            <span className="text-xl" aria-hidden>
              {q.emoji}
            </span>
            <p className="mt-2 text-sm font-semibold text-white group-hover:text-white">
              {q.label}
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-300">
              +{q.points} pts
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
