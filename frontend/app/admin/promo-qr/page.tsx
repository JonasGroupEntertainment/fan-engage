import { redirect } from "next/navigation";
import PromoQrTool from "@/components/promo-qr-tool";
import { getAdminContext } from "@/lib/admin";
import { canAdminCommunity } from "@/lib/admin-authz";
import { loadPromoQrContext } from "@/lib/promo-qr/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promo QR · Admin" };

/**
 * Static promo-link QR for the community this admin is managing.
 * Editors and above (super-admins included). Viewers and other tenants
 * are sent back to /admin. The page never fetches the link they type.
 */
export default async function AdminPromoQrPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/promo-qr");

  const communityId = ctx.currentCommunityId;
  if (!communityId || !canAdminCommunity(ctx, communityId, "editor")) {
    redirect("/admin");
  }

  const data = await loadPromoQrContext(communityId);

  return <PromoQrTool artistName={data.artistName} destinations={data.destinations} />;
}
