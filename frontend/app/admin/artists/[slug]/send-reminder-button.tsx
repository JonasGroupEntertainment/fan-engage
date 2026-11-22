"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave } from "@/lib/use-form-save";
import { sendReminderNowAction, type SendReminderNowResult } from "../actions";

/** One try only: a retry after a slow response must not send twice. */
const SEND_ATTEMPTS = 1;
const NO_ANSWER_MESSAGE =
  "We could not confirm the reminder was sent. Check the event before trying again.";

/**
 * "Send reminder now" for one event. Shows what happened in plain words
 * (how many went out, how many were skipped, or why nothing was sent)
 * instead of a silent refresh.
 */
export default function SendReminderButton({
  eventId,
  artistSlug,
}: {
  eventId: string;
  artistSlug: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<SendReminderNowResult | null>(null);
  const { invoke, submitting } = useFormSave({
    maxAttempts: SEND_ATTEMPTS,
    onSuccess: () => router.refresh(),
  });

  async function handleClick() {
    setResult(null);
    const formData = new FormData();
    formData.set("event_id", eventId);
    formData.set("artist_slug", artistSlug);
    const answer = await invoke<SendReminderNowResult>(() => sendReminderNowAction(formData));
    setResult(answer ?? { error: NO_ANSWER_MESSAGE });
  }

  return (
    <span className="flex max-w-xs flex-col items-end gap-1 text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="text-xs text-white/60 hover:text-white disabled:opacity-50"
      >
        {submitting ? "Sending…" : "📣 Send reminder now"}
      </button>
      {result && (
        <span
          role="status"
          className={`text-xs ${"error" in result ? "text-rose-300" : "text-emerald-300"}`}
        >
          {"error" in result ? result.error : result.message}
        </span>
      )}
    </span>
  );
}
