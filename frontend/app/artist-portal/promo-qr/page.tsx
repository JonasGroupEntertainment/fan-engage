import PromoQrTool from "@/components/promo-qr-tool";
import { requirePortalPage } from "@/lib/artist-portal/access";
import { loadPromoQrContext } from "@/lib/promo-qr/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promo QR · Artist Portal" };

/**
 * Same static promo-link tool as /admin/promo-qr, for artist-team staff.
 * Editor and above on this community only (PORTAL_MIN_ROLE.promoQr).
 * Not the rotating check-in code.
 */
export default async function ArtistPortalPromoQrPage() {
  const ctx = await requirePortalPage("promoQr", "/artist-portal/promo-qr");
  const data = await loadPromoQrContext(ctx.communityId);
  return <PromoQrTool artistName={data.artistName} destinations={data.destinations} />;
}
