"use client";

import { useState, useTransition } from "react";
import { answerEmailReaskAction } from "@/app/email-consent-actions";
import { EMAIL_CONSENT_TEXT } from "@/lib/marketing-consent";

const BOX = "rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-white/80";
const NOT_SAVED = "We could not save your choice. Check your connection and try again.";

/**
 * Asks a fan the old join form opted in without a tick whether they want
 * marketing email. The box starts unticked; nothing changes until they
 * press a button.
 */
export default function EmailReaskPrompt({ className = "" }: { className?: string }) {
  const [ticked, setTicked] = useState(false);
  const [done, setDone] = useState<null | "yes" | "no">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done === "yes") {
    return (
      <p className={`${BOX} ${className}`} role="status">
        Thanks. You will get email from us. Unsubscribe any time from any email.
      </p>
    );
  }
  if (done === "no") {
    return (
      <p className={`${BOX} ${className}`} role="status">
        Got it. No marketing email. You will still see everything in the app.
      </p>
    );
  }

  const answer = (agree: boolean) => {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof answerEmailReaskAction>>;
      try {
        result = await answerEmailReaskAction(agree);
      } catch {
        setError(NOT_SAVED);
        return;
      }
      if (!result.ok) setError(result.error);
      else setDone(agree ? "yes" : "no");
    });
  };

  return (
    <section className={`${BOX} ${className}`}>
      <h2 className="text-base font-semibold text-white">Want email from us?</h2>
      <p className="mt-1 text-white/70">
        We are updating how we ask about email. Tick the box if you would like it.
      </p>
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          name="email-consent"
          checked={ticked}
          onChange={(e) => setTicked(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-aurora"
        />
        <span>{EMAIL_CONSENT_TEXT}</span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!ticked || pending}
          onClick={() => answer(true)}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => answer(false)}
          className="rounded-lg px-4 py-2 text-sm text-white/70 underline disabled:opacity-50"
        >
          No thanks
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
