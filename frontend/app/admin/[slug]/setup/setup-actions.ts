"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import type { AdminRequirement } from "@/lib/admin-authz";
import { initializeCommunityFromApplication } from "@/lib/onboarding/init";

interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const SOCIAL_PLATFORMS: Array<{
  key: string;
  label: string;
  prefix: string;
}> = [
  { key: "instagram", label: "Instagram", prefix: "https://instagram.com/" },
  { key: "tiktok",    label: "TikTok",    prefix: "https://tiktok.com/@" },
  { key: "spotify",   label: "Spotify",   prefix: "" },
  { key: "youtube",   label: "YouTube",   prefix: "https://youtube.com/@" },
  { key: "twitter",   label: "Twitter",   prefix: "https://twitter.com/" },
];

/**
 * Guard for setup actions. Signed-out callers go to /login. Returns an
 * error result when the caller does not administer this community.
 */
async function requireAdmin(req: AdminRequirement): Promise<ActionResult | null> {
  const guard = await authorizeAdmin(req);
  if (guard.ok) return null;
  if (guard.reason === "signed_out") redirect("/login");
  return { ok: false, error: "forbidden" };
}

/**
 * Initialize the artist + community + seed rewards + welcome post for a
 * newly-approved slug. Idempotent.
 */
export async function initializeCommunityAction(
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "missing_slug" };
  // Creating an artist and community from an application is super-admin only.
  const denied = await requireAdmin({ superAdminOnly: true });
  if (denied) return denied;

  const result = await initializeCommunityFromApplication(slug);
  if (!result.ok) return { ok: false, error: result.error ?? "init_failed" };

  revalidatePath(`/admin/${slug}/setup`);
  const parts = [];
  if (result.created.artist) parts.push("artist row");
  if (result.created.community) parts.push("community row");
  if (result.created.rewards > 0) parts.push(`${result.created.rewards} rewards`);
  if (result.created.welcomePost) parts.push("welcome post");
  return {
    ok: true,
    message:
      parts.length > 0
        ? `Created: ${parts.join(", ")}`
        : "Already initialized — nothing to do",
  };
}

/**
 * Update artist tagline + bio (the two most-likely-edited copy fields).
 */
export async function updateProfileAction(
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  if (!slug) return { ok: false, error: "missing_slug" };
  const denied = await requireAdmin({ communityId: slug, minRole: "admin" });
  if (denied) return denied;

  const admin = createAdminClient();
  const { error } = await admin
    .from("artists")
    .update({ tagline, bio, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/${slug}/setup`);
  revalidatePath(`/artists/${slug}`);
  return { ok: true, message: "Profile saved" };
}

/**
 * Update artist branding — accent_from / accent_to.
 */
export async function updateBrandingAction(
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const accent_from = String(formData.get("accent_from") ?? "").trim();
  const accent_to = String(formData.get("accent_to") ?? "").trim();
  if (!slug) return { ok: false, error: "missing_slug" };
  const denied = await requireAdmin({ communityId: slug, minRole: "admin" });
  if (denied) return denied;
  if (!/^#[0-9a-fA-F]{6}$/.test(accent_from) || !/^#[0-9a-fA-F]{6}$/.test(accent_to)) {
    return { ok: false, error: "invalid_hex" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("artists")
    .update({ accent_from, accent_to, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/${slug}/setup`);
  revalidatePath(`/artists/${slug}`);
  return { ok: true, message: "Branding saved" };
}

/**
 * Update artist.social JSONB array from per-platform handle inputs.
 *
 * Form fields: instagram_handle, tiktok_handle, spotify_url,
 *              youtube_handle, twitter_handle.
 *
 * Empty inputs are skipped. Spotify takes a full URL (artist page);
 * the others take a username/handle (we prepend the canonical prefix).
 */
export async function updateSocialAction(
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "missing_slug" };
  const denied = await requireAdmin({ communityId: slug, minRole: "admin" });
  if (denied) return denied;

  const social: { label: string; href: string }[] = [];
  for (const p of SOCIAL_PLATFORMS) {
    const raw = String(formData.get(`${p.key}_handle`) ?? "").trim();
    if (!raw) continue;
    const href = p.key === "spotify"
      ? raw   // expect a full URL for spotify
      : raw.startsWith("http")
        ? raw
        : `${p.prefix}${raw.replace(/^@/, "")}`;
    social.push({ label: p.label, href });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("artists")
    .update({ social, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/${slug}/setup`);
  revalidatePath(`/artists/${slug}`);
  return {
    ok: true,
    message: social.length > 0
      ? `Saved ${social.length} social link${social.length === 1 ? "" : "s"}`
      : "Cleared social links",
  };
}

/**
 * Mark setup complete: flip communities.active = true, redirect to the
 * public artist page so the admin sees their work go live.
 */
export async function markSetupCompleteAction(
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return { ok: false, error: "missing_slug" };
  const denied = await requireAdmin({ communityId: slug, minRole: "admin" });
  if (denied) return denied;

  const admin = createAdminClient();
  const { error } = await admin
    .from("communities")
    .update({ active: true })
    .eq("slug", slug);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/${slug}/setup`);
  revalidatePath(`/artists/${slug}`);
  revalidatePath(`/artists`);
  return { ok: true, message: "Community is live" };
}

/**
 * Void-returning shims for direct <form action={...}> use.
 *
 * Next.js 16 requires server actions passed straight to <form action> to
 * return Promise<void>. The richer ActionResult variants above are still
 * used from client components via useTransition (Profile/Branding/Social
 * forms) where we want to surface error / success messages inline.
 *
 * For Initialize and Mark-complete, the page revalidates after the call
 * and re-renders with fresh state, which is itself the success signal.
 * Errors throw so they hit Next's error boundary and the admin sees them.
 */
export async function initializeCommunityFormAction(
  formData: FormData,
): Promise<void> {
  const result = await initializeCommunityAction(formData);
  if (!result.ok) {
    throw new Error(result.error ?? "init_failed");
  }
}

export async function markSetupCompleteFormAction(
  formData: FormData,
): Promise<void> {
  const result = await markSetupCompleteAction(formData);
  if (!result.ok) {
    throw new Error(result.error ?? "mark_complete_failed");
  }
}
