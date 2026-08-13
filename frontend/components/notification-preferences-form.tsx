"use client";

import { useState } from "react";
import { saveNotificationPreferencesAction } from "@/app/settings/notifications/actions";
import type { NotificationPreferences } from "@/lib/notifications/types";

/**
 * Settings form for /settings/notifications.
 *
 * Lets the fan toggle:
 *   - Master push on/off (controlled separately by the OS-level subscription)
 *   - Master SMS on/off (gated server-side to Gold+ tier for non-confirmation events)
 *   - Per-trigger toggles (new post, comments, redemptions, etc.)
 *   - Quiet-hours window
 *
 * Server action persists in one shot.
 */

interface Props {
  initial: NotificationPreferences;
  smsAllowed: boolean; // false for Bronze/Silver — disables the SMS toggle
  smsCopy?: string;    // explanatory text shown when smsAllowed is false
}

const TRIGGER_FIELDS: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}> = [
  {
    key: "notify_new_post",
    label: "New post from a followed artist",
    description: "Drops, announcements, photos.",
  },
  {
    key: "notify_event_match",
    label: "Tour date in your city",
    description: "When an artist you follow plays near you.",
  },
  {
    key: "notify_comment_on_my_post",
    label: "Replies on your posts",
    description: "Someone responded to a comment or post you made.",
  },
  {
    key: "notify_redemption",
    label: "Reward redemption updates",
    description: "Shipping confirmations, fulfillment notes.",
  },
  {
    key: "notify_drops",
    label: "Limited-time drops & sales",
    description: "Time-boxed rewards, exclusive digital drops.",
  },
  {
    key: "notify_rsvp_confirmation",
    label: "RSVP confirmations",
    description: "Right after you tap RSVP.",
  },
];

export default function NotificationPreferencesForm({
  initial,
  smsAllowed,
  smsCopy,
}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function setField<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveNotificationPreferencesAction(prefs);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Master channel toggles */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-base font-semibold text-white">Channels</h2>
        <p className="mt-1 text-xs text-white/60">
          Push covers desktop and Android. SMS is reserved for Gold and Platinum
          tiers so the channel stays signal, not spam.
        </p>

        <div className="mt-4 space-y-3">
          <ToggleRow
            label="Push notifications"
            description="Browser notifications when the app is closed."
            checked={prefs.push_enabled}
            onChange={(v) => setField("push_enabled", v)}
          />
          <ToggleRow
            label="SMS"
            description={
              smsAllowed
                ? "Tour-date and high-priority alerts to your phone."
                : (smsCopy ??
                    "Available at Gold and Platinum tiers. Keep climbing.")
            }
            checked={prefs.sms_enabled}
            onChange={(v) => smsAllowed && setField("sms_enabled", v)}
            disabled={!smsAllowed}
          />
        </div>
      </section>

      {/* Per-trigger toggles */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-base font-semibold text-white">What to send</h2>
        <p className="mt-1 text-xs text-white/60">
          Applies to both push and SMS — we won&apos;t badger you on one channel
          if you&apos;ve muted the other.
        </p>

        <div className="mt-4 space-y-3">
          {TRIGGER_FIELDS.map((f) => (
            <ToggleRow
              key={f.key}
              label={f.label}
              description={f.description}
              checked={Boolean(prefs[f.key])}
              onChange={(v) => setField(f.key, v as never)}
            />
          ))}
        </div>
      </section>

      {/* Quiet hours */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-base font-semibold text-white">Quiet hours</h2>
        <p className="mt-1 text-xs text-white/60">
          We&apos;ll hold non-urgent push during this window. RSVP and redemption
          confirmations are always delivered.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-white/70">
            Start
            <input
              type="time"
              value={prefs.quiet_start ?? ""}
              onChange={(e) =>
                setField("quiet_start", e.target.value || null)
              }
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/70">
            End
            <input
              type="time"
              value={prefs.quiet_end ?? ""}
              onChange={(e) =>
                setField("quiet_end", e.target.value || null)
              }
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs text-white/55">
          {savedAt ? "Saved." : "Changes save when you tap Save."}
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-black/20 p-3 ${
        disabled ? "opacity-50" : "hover:border-white/15"
      }`}
    >
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-white/60">{description}</p>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 cursor-pointer accent-aurora"
      />
    </label>
  );
}
