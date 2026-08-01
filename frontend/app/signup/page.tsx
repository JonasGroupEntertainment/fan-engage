import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPolicy } from "@/lib/data/policies";
import { SignupForm, type ReferrerArtist } from "./signup-form";

export const metadata = { title: "Sign up" };

async function getReferrerName(): Promise<string | null> {
  const cookieStore = await cookies();
  const code = cookieStore.get("fanengage_ref")?.value;
  if (!code) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("fans")
      .select("first_name")
      .eq("referral_code", code)
      .maybeSingle();
    const first = (data as { first_name?: string | null } | null)?.first_name;
    return first ?? null;
  } catch {
    return null;
  }
}

async function getReferrerArtist(slug: string | undefined): Promise<ReferrerArtist | null> {
  if (!slug) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("artists")
      .select("slug, name, tagline, accent_from, accent_to, active")
      .eq("slug", slug.toLowerCase())
      .eq("active", true)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      slug: string;
      name: string;
      tagline: string | null;
      accent_from: string;
      accent_to: string;
    };
    return {
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      accentFrom: row.accent_from,
      accentTo: row.accent_to,
    };
  } catch {
    return null;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  const sp = (await searchParams) ?? {};
  const [referrerName, referrerArtist, terms, privacy, rewardsTerms] = await Promise.all([
    getReferrerName(),
    getReferrerArtist(sp.ref),
    getPolicy("terms"),
    getPolicy("privacy"),
    getPolicy("rewards_terms"),
  ]);
  const consentDocs = [terms, privacy]
    .filter((p): p is NonNullable<typeof p> => !!p && !p.is_draft)
    .map((p) => ({ slug: p.slug, title: p.title, content_md: p.content_md }));
  const rewardsPublished = !!rewardsTerms && !rewardsTerms.is_draft;
  return (
    <Suspense fallback={null}>
      <SignupForm
        referrerName={referrerName}
        referrerArtist={referrerArtist}
        consentDocs={consentDocs}
        rewardsPublished={rewardsPublished}
      />
    </Suspense>
  );
}
