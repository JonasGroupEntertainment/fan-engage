"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { markFulfilledAction, cancelRedemptionAction } from "./actions";

interface RedemptionActionProps {
  redemptionId: string;
}

/**
 * Fulfill / Refund buttons for a redemption row in the queue.
 *
 * Wrapped in useFormSave so each click gets retry-on-503 + visible status,
 * and any business-logic error returned by the action ({ error: "..." }) is
 * surfaced inline instead of silently failing.
 */
export default function RedemptionAction({
  redemptionId,
}: RedemptionActionProps) {
  const router = useRouter();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [businessError, setBusinessError] = useState<string | null>(null);

  const { status, invoke, submitting } = useFormSave({
    onSuccess: () => router.refresh(),
  });

  async function handleFulfill() {
    setBusinessError(null);
    const result = await invoke(() => markFulfilledAction(redemptionId, note));
    if (result?.success) {
      setShowNote(false);
      setNote("");
    } else if (result?.error) {
      setBusinessError(result.error);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this redemption? Points will be refunded.")) return;
    setBusinessError(null);
    const result = await invoke(() =>
      cancelRedemptionAction(redemptionId),
    );
    if (result?.error) {
      setBusinessError(result.error);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showNote ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How was it fulfilled?"
            className="rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-xs text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleFulfill}
            disabled={submitting}
            className="rounded-lg bg-green-500/20 px-3 py-1 text-xs font-medium text-green-300 hover:bg-green-500/30 disabled:opacity-50"
          >
            {submitting ? "…" : "Done"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNote(false);
              setBusinessError(null);
            }}
            disabled={submitting}
            className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowNote(true)}
            disabled={submitting}
            className="rounded-lg bg-green-500/20 px-3 py-1 text-xs font-medium text-green-300 hover:bg-green-500/30 disabled:opacity-50"
          >
            Fulfill
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded-lg bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
          >
            {submitting ? "…" : "Refund"}
          </button>
        </>
      )}
      <SaveStatusIndicator status={status} className="text-xs" />
      {businessError && (
        <span
          className="text-xs text-rose-300"
          title={businessError}
        >
          ✗ {businessError}
        </span>
      )}
    </div>
  );
}
