"use client";

import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { createOfferAction } from "./actions";

export default function NewOfferForm() {
  const router = useRouter();
  const { status, submit, submitting } = useFormSave({
    onSuccess: () => router.refresh(),
  });

  async function handleSubmit(formData: FormData) {
    await submit(createOfferAction, formData);
  }

  return (
    <form action={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
      <input
        name="title"
        placeholder="Signed vinyl"
        required
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="slug"
        placeholder="signed-vinyl"
        required
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <select
        name="category"
        required
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        defaultValue="merch"
      >
        <option value="merch">Merch</option>
        <option value="experience">Experience</option>
        <option value="collectible">Collectible</option>
        <option value="digital">Digital</option>
        <option value="ticket">Ticket</option>
      </select>
      <select
        name="min_tier"
        required
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
        defaultValue="bronze"
      >
        <option value="bronze">Bronze+</option>
        <option value="silver">Silver+</option>
        <option value="gold">Gold+</option>
        <option value="platinum">Platinum</option>
      </select>
      <input
        name="price_points"
        type="number"
        min={0}
        placeholder="Price in points"
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <input
        name="inventory"
        type="number"
        min={0}
        placeholder="Inventory (optional)"
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
      />
      <textarea
        name="description"
        placeholder="Description"
        rows={2}
        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm md:col-span-2"
      />
      <div className="flex items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create offer"}
        </button>
        <SaveStatusIndicator status={status} />
      </div>
    </form>
  );
}
