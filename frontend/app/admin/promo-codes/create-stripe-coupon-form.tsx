"use client";

import { useState } from "react";

type Result = { ok: true; code: string; couponId: string } | { ok: false; error: string } | null;

export default function CreateStripeCouponForm() {
  const [result, setResult] = useState<Result>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/stripe-coupon", { method: "POST", body: fd });
    const json = await res.json();
    setResult(json);
    setPending(false);
    if (json.ok) (e.target as HTMLFormElement).reset();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
    >
      <p className="text-sm font-medium text-white/80">Create Stripe coupon + promo code</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs text-white/50">Promo code fans enter *</label>
          <input
            name="promo_code"
            required
            pattern="[A-Za-z0-9_\-]{3,32}"
            maxLength={32}
            placeholder="e.g. SUMMER25"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm uppercase tracking-wider text-white placeholder:normal-case placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Discount type</label>
          <select
            name="discount_type"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-aurora/50 focus:outline-none"
          >
            <option value="percent">Percent off</option>
            <option value="amount">Fixed amount off ($)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Amount (1 to 100%, or up to $100)</label>
          <input
            name="amount"
            type="number"
            required
            min="1"
            max="100"
            placeholder="25"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Duration</label>
          <select
            name="duration"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-aurora/50 focus:outline-none"
          >
            <option value="once">Once (first billing only)</option>
            <option value="repeating">Repeating (N months)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Duration months (if repeating, 1 to 12)</label>
          <input
            name="duration_months"
            type="number"
            min="1"
            max="12"
            placeholder="3"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Max redemptions * (1 to 1000)</label>
          <input
            name="max_redemptions"
            type="number"
            required
            min="1"
            max="1000"
            placeholder="100"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-aurora/20 px-5 py-2 text-sm font-medium text-aurora hover:bg-aurora/30 disabled:opacity-50 transition"
      >
        {pending ? "Creating…" : "Create in Stripe →"}
      </button>

      {result?.ok && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          ✓ Stripe coupon created. Promo code: <strong className="font-mono tracking-wider">{result.code}</strong>
          <br />
          <span className="text-xs text-emerald-400/70">Coupon ID: {result.couponId}</span>
        </div>
      )}
      {result?.ok === false && (
        <p className="text-sm text-red-400">{result.error}</p>
      )}
    </form>
  );
}
