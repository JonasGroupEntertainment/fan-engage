"use client";

import { useRouter } from "next/navigation";
import { useFormSave } from "@/lib/use-form-save";
import { toggleOfferActiveAction } from "./actions";

export default function OfferActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { submit, submitting } = useFormSave({
    onSuccess: () => router.refresh(),
  });

  async function handleClick() {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("active", String(!active));
    await submit(toggleOfferActiveAction, fd);
  }

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
      className="text-xs text-white/70 hover:text-white disabled:opacity-50"
    >
      {submitting ? "…" : active ? "Hide" : "Activate"}
    </button>
  );
}
