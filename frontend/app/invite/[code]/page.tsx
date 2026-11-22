import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArtistFromDb } from "@/lib/data/artists";
import SetRefCookie from "./set-ref-cookie";
import { parseArtistParam } from "@/lib/onboarding/artist-param";
import {
  invitePreviewImagePath,
  safeShareCard,
  shareCardArtist,
  type ShareContext,
} from "@/lib/invite-share";

type InviteSearchParams = { artist?: string | string[]; card?: string | string[] };

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * What the invite is about, when the fan shared from an artist page or a
 * share page (lib/invite-share.ts). Both values are checked before use: the
 * artist must exist, and the picture must be one of our own share pages for
 * that same artist.
 */
async function inviteContext(sp: InviteSearchParams) {
  const slug = parseArtistParam(sp.artist);
  const artist = slug ? await getArtistFromDb(slug).catch(() => null) : null;
  const card = artist ? safeShareCard(first(sp.card)) : null;
  return {
    artist,
    card: artist && card && shareCardArtist(card) === artist.slug ? card : null,
  };
}

const INVITE_SITE_NAME = "Fan Engage";
const INVITE_PREVIEW_DESCRIPTION = "Join free to earn points and unlock real drops.";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<InviteSearchParams>;
}): Promise<Metadata> {
  const { artist, card } = await inviteContext(await searchParams);
  const preview: ShareContext = { artist: artist?.slug ?? null, card };
  const image = invitePreviewImagePath(preview);
  const title = artist ? `You're invited to ${artist.name}'s Fan Experience` : "You're invited";
  return {
    title,
    // Invite links are personal. Keep them out of search results.
    robots: { index: false, follow: false },
    // These replace the site-wide preview settings whole, so the site name
    // and a description are repeated here.
    ...(image
      ? {
          openGraph: {
            type: "website",
            siteName: INVITE_SITE_NAME,
            title,
            description: INVITE_PREVIEW_DESCRIPTION,
            images: [image],
          },
          twitter: {
            card: "summary_large_image",
            title,
            description: INVITE_PREVIEW_DESCRIPTION,
            images: [image],
          },
        }
      : {}),
  };
}

async function getInviter(code: string): Promise<{
  firstName: string | null;
  referrerId: string;
} | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("fans")
      .select("id, first_name")
      .eq("referral_code", code)
      .maybeSingle();
    if (!data) return null;
    return { firstName: (data.first_name as string | null) ?? null, referrerId: data.id as string };
  } catch {
    return null;
  }
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<InviteSearchParams>;
}) {
  const { code } = await params;
  const [inviter, { artist }] = await Promise.all([
    getInviter(code),
    searchParams.then(inviteContext),
  ]);
  if (!inviter) notFound();

  const inviterName = inviter.firstName ?? "A Fan Engage fan";
  // Carry the invite code onto signup so fanengage_ref can still be written
  // after Accept if the guest skipped the banner on this page.
  // ?ref= keeps the legacy artist attribution; ?artist= is the explicit
  // pick that /onboarding validates and locks the invitee into.
  const signupParams = new URLSearchParams({ invite: code });
  if (artist) {
    signupParams.set("ref", artist.slug);
    signupParams.set("artist", artist.slug);
  }
  const signupHref = `/signup?${signupParams.toString()}`;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <SetRefCookie code={code} />
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/30 via-slate-900 to-ember/20 p-8 shadow-glass">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">You&apos;re invited</p>
        <h1 className="mt-3 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {artist
            ? `${inviterName} invited you to ${artist.name}'s Fan Experience`
            : `${inviterName} invited you to Fan Engage`}
        </h1>
        <p className="mt-4 text-sm text-white/75">
          {artist
            ? `Join in under a minute to follow ${artist.name}, earn your first 100 points, and get closer to drops, events, and rewards. ${inviterName} earns 150 points after you finish joining.`
            : `Join in under a minute to earn rewards, with 100 bonus points for you. ${inviterName} earns 150 points after you finish joining.`}
        </p>
        {artist && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5">
            <p className="text-xs uppercase tracking-wide text-white/70">
              {artist.genres.slice(0, 2).join(" · ") || "Artist hub"}
            </p>
            <p className="mt-2 text-xl font-semibold">{artist.name}</p>
            <p className="mt-1 text-sm text-white/65">
              {artist.tagline || "Drops, rewards, events, and fan-only moments."}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-white/75 sm:grid-cols-3">
              <span className="rounded-full bg-white/10 px-3 py-2 text-center">100 signup pts</span>
              <span className="rounded-full bg-white/10 px-3 py-2 text-center">Fan-only drops</span>
              <span className="rounded-full bg-white/10 px-3 py-2 text-center">Event access</span>
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={signupHref}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Create your account
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            I already have an account
          </Link>
        </div>
        <p className="mt-6 text-xs text-white/50">
          Invite code: <code className="font-mono">{code}</code>
        </p>
      </section>
    </main>
  );
}
