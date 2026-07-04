"use server";

import { revalidatePath } from "next/cache";
import { getPortalContext, roleAtLeast } from "@/lib/artist-portal/access";
import { generateBrief } from "@/lib/copilot/generate";

export async function refreshBriefAction() {
  const ctx = await getPortalContext();
  if (!ctx || !roleAtLeast(ctx.role, "editor")) {
    { console.warn('action error:', "Not authorized."); return; }
  }
  await generateBrief(ctx.communityId, { force: true });
  revalidatePath("/artist-portal/copilot");
  return;
}
