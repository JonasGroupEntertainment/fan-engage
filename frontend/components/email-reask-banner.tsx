import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { needsEmailReask } from "@/lib/marketing-consent";
import EmailReaskPrompt from "@/components/email-reask-prompt";

/**
 * Server wrapper for EmailReaskPrompt. Renders only for a signed-in fan
 * the old join form opted in to email without a tick. If the consent
 * columns do not exist yet (migration 0109) the read fails and nothing is
 * shown, because an answer could not be recorded.
 */
export default async function EmailReaskBanner({ className = "" }: { className?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: fan, error } = await createAdminClient()
    .from("fans")
    .select("email_opted_in, email_consent_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("EmailReaskBanner: read failed", { fanId: user.id, code: error.code });
    return null;
  }
  if (!needsEmailReask(fan)) return null;
  return <EmailReaskPrompt className={className} />;
}
