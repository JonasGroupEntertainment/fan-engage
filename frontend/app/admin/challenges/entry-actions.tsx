"use client";

import { useRouter } from "next/navigation";
import { useFormSave } from "@/lib/use-form-save";
import { adminDeleteEntryAction } from "@/app/admin/community/actions";
import { pickWinnerAction } from "./actions";

export default function EntryActions({
  postId,
  entryId,
  fanId,
  hasWinner,
}: {
  postId: string;
  entryId: string;
  fanId: string;
  hasWinner: boolean;
}) {
  const router = useRouter();
  const pickWinner = useFormSave({ onSuccess: () => router.refresh() });
  const deleteEntry = useFormSave({ onSuccess: () => router.refresh() });

  async function handlePickWinner() {
    const fd = new FormData();
    fd.set("post_id", postId);
    fd.set("entry_id", entryId);
    fd.set("fan_id", fanId);
    await pickWinner.submit(pickWinnerAction, fd);
  }

  async function handleDelete() {
    const fd = new FormData();
    fd.set("entry_id", entryId);
    await deleteEntry.submit(adminDeleteEntryAction, fd);
  }

  return (
    <div className="mt-3 flex items-center justify-between">
      {!hasWinner ? (
        <button
          onClick={handlePickWinner}
          disabled={pickWinner.submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pickWinner.submitting ? "Picking…" : "Pick winner · +200 pts"}
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={handleDelete}
        disabled={deleteEntry.submitting}
        className="text-xs text-rose-300/80 hover:text-rose-300 disabled:opacity-50"
      >
        {deleteEntry.submitting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
