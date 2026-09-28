"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import type { OfferCategory, TierSlug } from "@/lib/data/types";

const CATEGORIES: OfferCategory[] = ["merch", "experience", "collectible", "digital", "ticket"];
const TIERS: TierSlug[] = ["bronze", "silver", "gold", "platinum"];

/**
 * Offers belong to a community. Signed-out callers go to login; callers
 * who do not administer the community get "Forbidden".
 */
async function requireCommunityAdmin(communityId: string | null | undefined) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin");
  const target = communityId ?? ctx.currentCommunityId;
  if (!target) throw new Error("Forbidden");
  const guard = await authorizeAdmin({ communityId: target, minRole: "admin" }, ctx);
  if (!guard.ok) throw new Error("Forbidden");
  return target;
}

export async function createOfferAction(formData: FormData) {
  // New offers land in the admin's active community (the column otherwise
  // defaults to 'raelynn').
  const communityId = await requireCommunityAdmin(null);

  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "merch");
  const minTierRaw = String(formData.get("min_tier") ?? "bronze");
  const pricePointsRaw = formData.get("price_points");
  const inventoryRaw = formData.get("inventory");

  if (!title || !slug) return;

  const category = (CATEGORIES.includes(categoryRaw as OfferCategory)
    ? categoryRaw
    : "merch") as OfferCategory;
  const min_tier = (TIERS.includes(minTierRaw as TierSlug)
    ? minTierRaw
    : "bronze") as TierSlug;

  const admin = createAdminClient();
  await admin.from("offers").insert({
    title,
    slug,
    description: description || null,
    category,
    min_tier,
    price_points: pricePointsRaw ? Number(pricePointsRaw) : null,
    inventory: inventoryRaw ? Number(inventoryRaw) : null,
    active: true,
    community_id: communityId,
  });

  revalidatePath("/admin/offers");
  revalidatePath("/marketplace");
  revalidatePath("/");
}

export async function toggleOfferActiveAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  if (!id) return;

  const admin = createAdminClient();
  const { data: offer } = await admin
    .from("offers")
    .select("community_id")
    .eq("id", id)
    .maybeSingle();
  if (!offer) return;
  await requireCommunityAdmin(offer.community_id as string);
  await admin.from("offers").update({ active }).eq("id", id);

  revalidatePath("/admin/offers");
  revalidatePath("/marketplace");
  revalidatePath("/");
}
