"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Influencer {
  id: string;
  handle: string;
  platform: string;
  real_name: string | null;
  artist_slug: string;
  status: string;
  created_at: string;
}

interface PromoCode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_redemptions: number | null;
  current_redemptions: number;
  created_at: string;
}

export default function InfluencerDetailPage() {
  const params = useParams();
  const influencerId = params.id as string;
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch influencer (via Supabase directly since we have limited API endpoints)
        // For now, we'll create a more complete API endpoint
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    fetchData();
  }, [influencerId]);

  const handleAddPromoCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      setStatus("Creating promo code...");
      const res = await fetch(`/api/admin/influencers/${influencerId}/promo-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formData.get("code"),
          discount_type: formData.get("discount_type"),
          discount_value: parseInt(String(formData.get("discount_value")), 10),
          max_redemptions: formData.get("max_redemptions")
            ? parseInt(String(formData.get("max_redemptions")), 10)
            : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus(`Error: ${err.error}`);
        return;
      }

      const { data } = await res.json();
      setPromoCodes([data, ...promoCodes]);
      setStatus("Promo code created!");
      e.currentTarget.reset();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // Generate tracking URL with UTM parameters
  const generateTrackingUrl = (code: string): string => {
    if (!influencer) return "";
    return `${process.env.NEXT_PUBLIC_SITE_URL || "https://fanengagepro.com"}?utm_source=${influencer.handle}&utm_medium=influencer&utm_campaign=${code}`;
  };

  if (loading) {
    return <div className="text-white/60">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-400">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Influencer Details
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Manage influencer profile and assign promo codes for tracking.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-semibold">Promo Codes</h2>
        <p className="mt-1 text-sm text-white/60">Create and manage promotional codes assigned to this influencer.</p>

        {promoCodes.length > 0 && (
          <div className="mt-4 space-y-2">
            {promoCodes.map((pc) => (
              <div key={pc.id} className="rounded-lg border border-white/5 bg-black/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold">{pc.code}</p>
                    <p className="text-xs text-white/60">
                      {pc.discount_type === "percent"
                        ? `${pc.discount_value}% off`
                        : pc.discount_type === "fixed_amount"
                          ? `$${pc.discount_value} off`
                          : `${pc.discount_value} points`}
                      {pc.max_redemptions && ` • Max ${pc.max_redemptions} uses`}
                      {` • ${pc.current_redemptions} redeemed`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateTrackingUrl(pc.code));
                      setStatus("Tracking URL copied!");
                    }}
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddPromoCode} className="mt-6 space-y-3 rounded-lg border border-dashed border-white/15 bg-black/20 p-4">
          <p className="text-sm font-semibold">Add New Promo Code</p>

          <div>
            <label className="text-xs font-semibold">Code</label>
            <input
              type="text"
              name="code"
              placeholder="e.g., RAELYNN_FAN_2024"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold">Discount Type</label>
              <select
                name="discount_type"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                required
              >
                <option value="percent">Percentage</option>
                <option value="fixed_amount">Fixed Amount</option>
                <option value="points">Points</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold">Value</label>
              <input
                type="number"
                name="discount_value"
                placeholder="e.g., 20"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold">Max Redemptions (optional)</label>
            <input
              type="number"
              name="max_redemptions"
              placeholder="Leave blank for unlimited"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20"
          >
            Create Promo Code
          </button>

          {status && (
            <p className={`text-xs ${status.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
              {status}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
