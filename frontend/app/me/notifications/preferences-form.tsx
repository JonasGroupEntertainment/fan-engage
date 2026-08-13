"use client";

import { useState, useTransition } from "react";
import { savePreferencesAction } from "./actions";

/**
 * Aligned to the actual notification_preferences columns on FE+BEP
 * (verified 2026-05-05).
 */
export type Prefs = {
  // Channel toggles
  push_enabled: boolean;
  sms_enabled: boolean;
  // Notification types
  notify_new_post: boolean;
  notify_event_match: boolean;
  notify_comment_on_my_post: boolean;
  notify_redemption: boolean;
  notify_drops: boolean;
  notify_rsvp_confirmation: boolean;
  notify_predictions: boolean;
  notify_anniversaries: boolean;
  notify_leaderboard: boolean;
  notify_weekly_digest: boolean;
};

const CHANNEL_ROWS: Array<{
  key: keyof Prefs;
  emoji: string;
  title: string;
  body: string;
}> = [
  {
    key: "push_enabled",
    emoji: "🔔",
    title: "Push notifications",
    body: "Tap-and-go alerts in your browser/phone for time-sensitive moments.",
  },
  {
    key: "sms_enabled",
    emoji: "📱",
    title: "SMS",
    body: "Text messages for the most important updates (drops, anniversaries).",
  },
];

const TYPE_ROWS: Array<{
  key: keyof Prefs;
  emoji: string;
  title: string;
  body: string;
}> = [
  {
    key: "notify_drops",
    emoji: "🎁",
    title: "Drops & releases",
    body: "In-app digital drops and surprise releases.",
  },
  {
    key: "notify_predictions",
    emoji: "🔮",
    title: "Predictions & polls",
    body: "When a poll resolves and points are awarded.",
  },
  {
    key: "notify_anniversaries",
    emoji: "🎉",
    title: "Anniversary moments",
    body: "Milestones for how long you've been with each community.",
  },
  {
    key: "notify_leaderboard",
    emoji: "🏆",
    title: "Leaderboard movement",
    body: "When you climb a tier or land on the top members board.",
  },
  {
    key: "notify_event_match",
    emoji: "🎫",
    title: "Events near you",
    body: "Tour stops, listening parties, and specials matching your area.",
  },
  {
    key: "notify_new_post",
    emoji: "📝",
    title: "New community posts",
    body: "When the artist or brand drops a new community post.",
  },
  {
    key: "notify_comment_on_my_post",
    emoji: "💬",
    title: "Comments on your posts",
    body: "Replies to community posts you've authored.",
  },
  {
    key: "notify_rsvp_confirmation",
    emoji: "✅",
    title: "RSVP confirmations",
    body: "Receipts after you RSVP to an event.",
  },
  {
    key: "notify_redemption",
    emoji: "🎟️",
    title: "Redemption updates",
    body: "Status changes on your reward redemptions.",
  },
  {
    key: "notify_weekly_digest",
    emoji: "📰",
    title: "Weekly digest",
    body: "A Sunday email with what you missed this week.",
  },
];

export function PreferencesForm({
  initial,
  hadRow,
}: {
  initial: Prefs;
  hadRow: boolean;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allRows = [...CHANNEL_ROWS, ...TYPE_ROWS];
  const dirty = allRows.some((r) => prefs[r.key] !== initial[r.key]);

  function toggle(key: keyof Prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSavedAt(null);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await savePreferencesAction(prefs);
      if (res && 'error' in res) {
        setError(res.error);
      } else {
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <div className="space-y-6">
      <Section title="Channels">
        {CHANNEL_ROWS.map((row) => (
          <PrefRow
            key={row.key}
            row={row}
            on={prefs[row.key]}
            onToggle={() => toggle(row.key)}
          />
        ))}
      </Section>

      <Section title="What to notify me about">
        {TYPE_ROWS.map((row) => (
          <PrefRow
            key={row.key}
            row={row}
            on={prefs[row.key]}
            onToggle={() => toggle(row.key)}
          />
        ))}
      </Section>

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm">
          {error && <span className="text-rose-300">{error}</span>}
          {savedAt && !error && (
            <span className="text-emerald-300">Saved.</span>
          )}
          {!savedAt && !error && !hadRow && dirty && (
            <span className="text-white/50">
              First save creates your preferences row.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className={
            "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition " +
            (!dirty || pending
              ? "bg-white/10 text-white/50 cursor-not-allowed"
              : "bg-white text-black hover:bg-white/90")
          }
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs uppercase tracking-widest text-white/50">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PrefRow({
  row,
  on,
  onToggle,
}: {
  row: { key: keyof Prefs; emoji: string; title: string; body: string };
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20">
      <span aria-hidden className="mt-0.5 text-xl">
        {row.emoji}
      </span>
      <div className="flex-1">
        <div className="font-medium">{row.title}</div>
        <p className="mt-0.5 text-sm text-white/60">{row.body}</p>
      </div>
      <span className="mt-1 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={on}
          onChange={onToggle}
          aria-label={`Toggle ${row.title}`}
        />
        <span
          className={
            "block h-6 w-11 rounded-full transition " +
            (on ? "bg-emerald-500" : "bg-white/15")
          }
        >
          <span
            className={
              "block h-5 w-5 translate-y-0.5 rounded-full bg-white transition " +
              (on ? "translate-x-[22px]" : "translate-x-0.5")
            }
          />
        </span>
      </span>
    </label>
  );
}
