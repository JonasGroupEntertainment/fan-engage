"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import type { AiGateResolution } from "@/lib/ai-gates/core";
import { clearAiGateAction, setAiGateAction } from "./actions";

/**
 * One cell of the features × communities matrix. Wired features get an
 * on/off toggle plus "use env" to drop the row; display-only features show
 * the resolved value greyed with "not wired yet".
 */
export default function GateToggle({
  feature,
  communityId,
  wired,
  gate,
}: {
  feature: string;
  communityId: string;
  wired: boolean;
  gate: AiGateResolution;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({ onSuccess: () => router.refresh() });

  async function set(enabled: boolean) {
    setError(null);
    const fd = new FormData();
    fd.set("feature", feature);
    fd.set("community_id", communityId);
    fd.set("enabled", enabled ? "true" : "false");
    const result = await submit(setAiGateAction, fd);
    if (result && "error" in result) setError(result.error);
  }

  async function clear() {
    setError(null);
    const fd = new FormData();
    fd.set("feature", feature);
    fd.set("community_id", communityId);
    const result = await submit(clearAiGateAction, fd);
    if (result && "error" in result) setError(result.error);
  }

  const isRow = gate.source === "row";
  const label = gate.enabled ? "Free for all" : "Premium only";

  if (!wired) {
    return (
      <div className="text-xs text-white/40">
        <span>{label}</span>
        <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase">
          not wired yet
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => set(!gate.enabled)}
          disabled={submitting}
          role="switch"
          aria-checked={gate.enabled}
          aria-label={`${feature} for ${communityId}: ${label}`}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
            gate.enabled ? "bg-emerald-500/70" : "bg-white/15"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              gate.enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className={`text-xs ${isRow ? "text-white" : "text-white/45"}`}>{label}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
            isRow
              ? "bg-aurora/20 text-aurora"
              : gate.source === "env"
                ? "border border-white/15 text-white/45"
                : "border border-white/10 text-white/30"
          }`}
          title={
            isRow
              ? "Set by a row in ai_feature_gates"
              : gate.source === "env"
                ? "No row — AI_DRAFTER_FREE_COMMUNITIES opens it"
                : "No row, no env — off"
          }
        >
          {isRow ? "db row" : gate.source === "env" ? "env" : "default"}
        </span>
        {isRow && (
          <button
            type="button"
            onClick={clear}
            disabled={submitting}
            className="text-[11px] text-white/50 underline-offset-2 hover:text-white hover:underline disabled:opacity-50"
            title={`Drop the row; env fallback would make it ${gate.envEnabled ? "free" : "Premium only"}`}
          >
            use env ({gate.envEnabled ? "free" : "Premium"})
          </button>
        )}
        <SaveStatusIndicator status={status} />
      </div>
      {error && <p className="text-[11px] text-rose-300">✗ {error}</p>}
    </div>
  );
}
