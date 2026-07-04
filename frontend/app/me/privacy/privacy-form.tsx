"use client";

import { useState, useTransition } from "react";
import { savePrivacyAction } from "./actions";

export default function PrivacyForm({
  initialPublicProfileEnabled,
  profileSlug,
}: {
  initialPublicProfileEnabled: boolean;
  profileSlug: string | null;
}) {
  const [publicProfile, setPublicProfile] = useState(
    initialPublicProfileEnabled,
  );
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function onChange(next: boolean) {
    setPublicProfile(next);
    const fd = new FormData();
    fd.set("public_profile_enabled", String(next));
    startTransition(async () => {
      await savePrivacyAction(fd);
      setSavedAt(Date.now());
    });
  }

  const profileUrl = profileSlug ? `/fans/${profileSlug}` : null;

  return (
    <div className="space-y-6">
      <Toggle
        label="Public profile page"
        description={
          profileUrl ? (
            <>
              When on, your profile is visible at{" "}
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-white"
              >
                {profileUrl}
              </a>
              . Fans can find you, see your tier, badges, and the communities
              you follow.
            </>
          ) : (
            "When on, your profile is publicly viewable to other fans."
          )
        }
        checked={publicProfile}
        onChange={onChange}
        disabled={pending}
      />

      {savedAt && !pending && (
        <p className="text-xs text-emerald-300/80">Saved.</p>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/60">
        <p className="font-semibold text-white/80">What&apos;s never shown publicly</p>
        <p className="mt-2">
          Your email, phone number, mailing address, last login, payment
          details, and any moderation flags are{" "}
          <span className="text-white/80">never</span> displayed on your public
          profile or anywhere else other fans can see — regardless of the
          toggle above. Only your first name, avatar, tier, badges, and the
          communities you follow appear publicly.
        </p>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-aurora"
      />
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="mt-1 text-sm text-white/60">{description}</div>
      </div>
    </label>
  );
}
