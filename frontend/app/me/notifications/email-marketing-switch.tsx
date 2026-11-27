"use client";

import { useState, useTransition } from "react";
import { EMAIL_CONSENT_TEXT } from "@/lib/marketing-consent";
import { setMarketingEmailAction } from "./email-marketing-actions";

const NOT_SAVED = "We could not save your email setting. Check your connection and try again.";

/**
 * Marketing email on or off. Turning it on shows the same unticked
 * consent box as the join form, so every "on" has a recorded tick behind it.
 */
export default function EmailMarketingSwitch({
  initialOn,
  hasEmail,
}: {
  initialOn: boolean;
  hasEmail: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: boolean) => {
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof setMarketingEmailAction>>;
      try {
        result = await setMarketingEmailAction(next);
      } catch {
        // The request never came back (offline, dropped connection).
        setError(NOT_SAVED);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOn(result.on);
      setTicked(false);
    });
  };

  return (
    <section className="mb-8 rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-sm text-white/80">
      <h2 className="text-base font-semibold text-white">Marketing email</h2>
      {!hasEmail ? (
        <p className="mt-1 text-white/60">Add an email address to your account to get email from us.</p>
      ) : on ? (
        <>
          <p className="mt-1 text-white/70" role="status">
            On. You get artist news, drops, events, and rewards by email.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => save(false)}
            className="mt-3 rounded-lg border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Turn off marketing email"}
          </button>
          <p className="mt-2 text-xs text-white/50">
            Turning this off also stops event reminder emails. You will still see everything in the app.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-white/70" role="status">
            Off.
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
          <button
            type="button"
            disabled={!ticked || pending}
            onClick={() => save(true)}
            className="mt-3 rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Turn on"}
          </button>
        </>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
