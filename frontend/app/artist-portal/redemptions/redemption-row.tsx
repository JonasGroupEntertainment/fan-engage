"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fulfillRedemptionAction, cancelRedemptionPortalAction } from "./actions";

interface Redemption {
  id: string;
  fan_id: string;
  point_cost: number;
  status: string;
  delivery_details: string | null;
  created_at: string;
  fulfillment_note: string | null;
  rewards: { title: string } | null;
}

export default function RedemptionRow({
  redemption,
  fanName,
}: {
  redemption: Redemption;
  fanName: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPending = redemption.status === "pending";

  async function handleFulfill() {
    setLoading(true);
    setErr(null);
    const fd = new FormData();
    fd.set("redemption_id", redemption.id);
    fd.set("note", note);
    const result = await fulfillRedemptionAction(fd);
    if (result?.error) setErr(result.error);
    else router.refresh();
    setLoading(false);
  }

  async function handleCancel() {
    if (!confirm("Cancel this redemption and refund points?")) return;
    setLoading(true);
    const fd = new FormData();
    fd.set("redemption_id", redemption.id);
    fd.set("fan_id", redemption.fan_id);
    fd.set("point_cost", String(redemption.point_cost));
    const result = await cancelRedemptionPortalAction(fd);
    if (result?.error) setErr(result.error);
    else router.refresh();
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white text-sm">
            {fanName} · {redemption.rewards?.title ?? "Reward"}
          </p>
          <p className="text-xs text-white/50 mt-0.5">
            {redemption.point_cost.toLocaleString()} pts ·{" "}
            {new Date(redemption.created_at).toLocaleDateString()}
          </p>
          {redemption.delivery_details && (
            <p className="mt-1 text-xs text-white/60 bg-white/5 rounded-lg px-2 py-1">
              {redemption.delivery_details}
            </p>
          )}
          {redemption.fulfillment_note && (
            <p className="mt-1 text-xs text-green-300/70">
              Note: {redemption.fulfillment_note}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          isPending
            ? "bg-yellow-500/20 text-yellow-300"
            : "bg-green-500/20 text-green-300"
        }`}>
          {redemption.status}
        </span>
      </div>

      {isPending && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Fulfillment note (optional)"
            className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none"
          />
          <button
            onClick={handleFulfill}
            disabled={loading}
            className="rounded-full bg-green-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
          >
            {loading ? "…" : "Mark fulfilled"}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:text-rose-300 hover:border-rose-500/30 disabled:opacity-50"
          >
            Cancel & refund
          </button>
          {err && <span className="text-xs text-rose-300">✗ {err}</span>}
        </div>
      )}
    </div>
  );
}
