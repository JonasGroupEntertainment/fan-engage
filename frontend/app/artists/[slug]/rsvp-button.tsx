"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleRsvpAction } from "./rsvp-actions";
import InlineShareButton from "@/components/inline-share-button";

export default function RsvpButton({
  eventId,
  artistSlug,
  initialRsvped,
  atCapacity,
}: {
  eventId: string;
  artistSlug: string;
  initialRsvped: boolean;
  atCapacity: boolean;
}) {
  const router = useRouter();
  const [rsvped, setRsvped] = useState(initialRsvped);
  const [justRsvped, setJustRsvped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";
  const shareUrl = `${appUrl}/share/rsvp/${artistSlug}/${eventId}`;

  async function handleClick() {
    const next = !rsvped;
    setRsvped(next); // optimistic
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("event_id", eventId);
      fd.set("artist_slug", artistSlug);
      fd.set("rsvp", String(next));
      const result = await toggleRsvpAction(fd);
      if (!result.ok) {
        setRsvped(!next);
        setError(result.error);
      } else {
        if (next) setJustRsvped(true);
        router.refresh();
      }
    });
  }

  const disabled = pending || (!rsvped && atCapacity);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
          rsvped
            ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
            : "bg-gradient-to-r from-aurora to-ember text-white"
        }`}
      >
        {rsvped ? "✓ RSVPed" : atCapacity ? "Full" : "RSVP · +10 pts"}
      </button>
      {justRsvped && (
        <div className="flex flex-col items-end gap-1">
          <p className="text-xs text-white/50">You&apos;re in! Invite friends to join you.</p>
          <InlineShareButton
            title="Bring a friend!"
            text={`I just RSVPed — come join me: ${shareUrl}`}
            url={shareUrl}
            label="↗ Bring 2 friends"
            className="text-xs text-aurora hover:text-white transition"
          />
        </div>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
