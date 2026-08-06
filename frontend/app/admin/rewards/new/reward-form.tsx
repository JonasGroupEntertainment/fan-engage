"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { createRewardAction } from "../actions";

/**
 * Client form for /admin/rewards/new. Uses useFormSave for retry-on-503
 * + visible status, and surfaces business-logic errors returned by
 * createRewardAction (e.g. validation failures).
 */
export default function NewRewardForm() {
  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessError(null);
    const fd = new FormData(e.currentTarget);
    const result = await submit(createRewardAction, fd);
    if (result?.success) {
      router.push("/admin/rewards");
    } else if (result?.error) {
      setBusinessError(result.error);
    }
    // If result is undefined, the hook's status is already "error" — no
    // additional handling needed here.
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-card space-y-4 rounded-2xl p-6"
    >
      <div>
        <label htmlFor="reward-title" className="block text-sm font-medium">Title *</label>
        <input
          id="reward-title"
          type="text"
          name="title"
          required
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
          placeholder="E.g., Personalized Voice Note"
        />
      </div>

      <div>
        <label htmlFor="reward-description" className="block text-sm font-medium">Description</label>
        <textarea
          id="reward-description"
          name="description"
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
          placeholder="E.g., A personalized 30-second voice note"
          rows={3}
        />
      </div>

      <div>
        <label htmlFor="reward-image-url" className="block text-sm font-medium">Image URL</label>
        <input
          id="reward-image-url"
          type="url"
          name="image_url"
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
          placeholder="https://..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="reward-point-cost" className="block text-sm font-medium">Point Cost *</label>
          <input
            id="reward-point-cost"
            type="number"
            name="point_cost"
            required
            min="1"
            aria-describedby="reward-point-cost-hint"
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
            placeholder="5000"
          />
          <p id="reward-point-cost-hint" className="sr-only">Number of points a fan spends to redeem this reward.</p>
        </div>

        <div>
          <label htmlFor="reward-kind" className="block text-sm font-medium">Kind *</label>
          <select
            id="reward-kind"
            name="kind"
            required
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
          >
            <option value="">Select kind</option>
            <option value="voice_note">Voice Note</option>
            <option value="video_shoutout">Video Shoutout</option>
            <option value="merch_discount">Merch Discount</option>
            <option value="early_access">Early Access</option>
            <option value="experience">Experience</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="reward-stock" className="block text-sm font-medium">
            Stock (leave blank for unlimited)
          </label>
          <input
            id="reward-stock"
            type="number"
            name="stock"
            min="0"
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
            placeholder="10"
          />
        </div>

        <div>
          <label htmlFor="reward-requires-tier" className="block text-sm font-medium">Requires Tier</label>
          <select
            id="reward-requires-tier"
            name="requires_tier"
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white focus:border-white/30 focus:outline-none"
          >
            <option value="">None</option>
            <option value="premium">Premium</option>
            <option value="founder-only">Founder Only</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-6">
        <button
          type="submit"
          disabled={submitting}
          aria-describedby={businessError ? "reward-form-error" : undefined}
          className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Reward"}
        </button>
        <SaveStatusIndicator status={status} />
        {businessError && (
          <span id="reward-form-error" role="alert" className="text-xs text-rose-300" title={businessError}>
            ✗ {businessError}
          </span>
        )}
      </div>
    </form>
  );
}
