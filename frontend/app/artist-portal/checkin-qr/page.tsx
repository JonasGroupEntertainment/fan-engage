import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortalPage } from "@/lib/artist-portal/access";
import { mintCheckinToken } from "@/lib/checkin-token";
import { APP_URL } from "@/lib/app-url";
import CheckinQr from "./checkin-qr";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check-in QR · Artist Portal" };

export default async function ArtistPortalCheckinQrPage() {
  // Live venue QR: editor and above (PORTAL_MIN_ROLE.checkinQr).
  const ctx = await requirePortalPage("checkinQr", "/artist-portal/checkin-qr");
  const artistSlug = ctx.communityId;

  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select("slug, display_name")
    .eq("slug", artistSlug)
    .maybeSingle();
  const artistName = (community?.display_name as string | undefined) ?? artistSlug;

  // First signed URL from the server so the QR renders on first paint; the
  // client component re-fetches /api/admin/checkin-token as it rotates.
  const mint = mintCheckinToken(artistSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-semibold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Check-in QR
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Fans scan this at the venue or merch table to check in and earn points — once per day.
        </p>
      </div>
      <CheckinQr
        artistSlug={artistSlug}
        artistName={artistName}
        initialUrl={`${APP_URL}${mint.path}`}
        initialExpiresAt={mint.expiresAt}
        rotationSeconds={mint.rotationSeconds}
        rotation={mint.rotation}
      />
    </div>
  );
}
