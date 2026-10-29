"use client";

import { useActionState, useState } from "react";
import { markThankedAction, type ThankState } from "./actions";

/**
 * The per-fan controls: copy the thank-you template, and (editor+) mark
 * the fan thanked with an optional note. The template is composed on the
 * server (it names the fan and the artist); this only copies it.
 */
export default function SuperfanRowActions({
  fanId,
  template,
  canThank,
}: {
  fanId: string;
  template: string;
  canThank: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [state, formAction, pending] = useActionState<ThankState, FormData>(markThankedAction, null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  }

  const done = state?.success && state.fanId === fanId;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
      >
        {copied ? "Copied!" : "Copy thank-you"}
      </button>
      {canThank && !done && (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="fan_id" value={fanId} />
          <input
            type="text"
            name="note"
            placeholder="note (optional)"
            maxLength={500}
            className="w-36 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-white placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Mark thanked"}
          </button>
        </form>
      )}
      {done && <span className="text-xs text-emerald-300">Thanked</span>}
      {state?.error && !done && <span className="text-xs text-red-300">{state.error}</span>}
    </div>
  );
}
