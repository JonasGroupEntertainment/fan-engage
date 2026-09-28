"use client";

import { useState, useTransition } from "react";
import { savePreferencesAction } from "./actions";
import type { Prefs, ToggleKey } from "./prefs";

export type { Prefs } from "./prefs";

const CHANNEL_ROWS: Array<{
  key: ToggleKey;
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
  key: ToggleKey;
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
  smsAllowed,
  smsCopy,
}: {
  initial: Prefs;
  hadRow: boolean;
  smsAllowed: boolean; // false below Gold: SMS can be turned off, not on
  smsCopy?: string; // shown on the SMS row when smsAllowed is false
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allRows = [...CHANNEL_ROWS, ...TYPE_ROWS];
  const dirty =
    allRows.some((r) => prefs[r.key] !== initial[r.key]) ||
    prefs.quiet_start !== initial.quiet_start ||
    prefs.quiet_end !== initial.quiet_end;

  function update(patch: Partial<Prefs>) {
    setPrefs((p) => ({ ...p, ...patch }));
    setSavedAt(null);
    setError(null);
  }

  function toggle(key: ToggleKey) {
    update({ [key]: !prefs[key] });
  }

  // Below Gold the SMS switch is locked: it can go off but not back on.
  function smsLocked(key: ToggleKey): boolean {
    return key === "sms_enabled" && !smsAllowed && !prefs.sms_enabled;
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await savePreferencesAction(prefs);
        if ("error" in res) {
          setError(res.error);
        } else {
          setSavedAt(Date.now());
        }
      } catch {
        setError("Could not save your preferences. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Section title="Channels">
        {CHANNEL_ROWS.map((row) => (
          <PrefRow
            key={row.key}
            row={
              row.key === "sms_enabled" && !smsAllowed
                ? {
                    ...row,
                    body:
                      smsCopy ??
                      "Available at Gold and Platinum tiers. Keep climbing.",
                  }
                : row
            }
            on={prefs[row.key]}
            disabled={smsLocked(row.key)}
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

      <Section title="Quiet hours">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-sm text-white/60">
            We hold non-urgent alerts during this window. RSVP and redemption
            confirmations always come through.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TimeField
              label="Start"
              value={prefs.quiet_start}
              onChange={(v) => update({ quiet_start: v })}
            />
            <TimeField
              label="End"
              value={prefs.quiet_end}
              onChange={(v) => update({ quiet_end: v })}
            />
          </div>
        </div>
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

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/70">
      {label}
      <input
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
      />
    </label>
  );
}

function PrefRow({
  row,
  on,
  disabled,
  onToggle,
}: {
  row: { key: ToggleKey; emoji: string; title: string; body: string };
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={
        "flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition " +
        (disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-white/20")
      }
    >
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
          disabled={disabled}
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
