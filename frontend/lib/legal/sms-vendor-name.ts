/**
 * policy_pages rows live in the database. This rewrites a stored
 * "Twilio" vendor name to Mailchimp when a policy is rendered.
 * The stored row is not updated. The Mailchimp 10DLC sentence is
 * left alone because it does not name a vendor.
 */
export function applyStoredSmsVendorName(content: string): string {
  return content
    .replaceAll("(Supabase, Mailchimp, Twilio)", "(Supabase, Mailchimp)")
    .replaceAll("Mailchimp, Twilio", "Mailchimp")
    .replaceAll("Twilio, Mailchimp", "Mailchimp")
    .replaceAll("Mailchimp or Twilio", "Mailchimp")
    .replaceAll("Twilio or Mailchimp", "Mailchimp")
    .replaceAll("Twilio", "Mailchimp");
}
