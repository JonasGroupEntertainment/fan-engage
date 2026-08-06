"use client";

import { useActionState } from "react";
import { redeemPromoCode } from "./actions";

export default function PromoCodeForm() {
  const [result, action, pending] = useActionState(redeemPromoCode, null);

  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        ✓ {result.message}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        <input
          name="code"
          type="text"
          placeholder="Enter promo code"
          className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm uppercase tracking-wider text-white placeholder:normal-case placeholder:tracking-normal placeholder:text-white/50 focus:border-aurora/50 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-aurora/20 px-5 py-2.5 text-sm font-medium text-aurora hover:bg-aurora/30 disabled:opacity-50 transition"
        >
          {pending ? "Checking…" : "Apply"}
        </button>
      </div>
      {result?.ok === false && (
        <p className="text-xs text-red-400">{result.error}</p>
      )}
    </form>
  );
}
