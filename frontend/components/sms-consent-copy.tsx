import Link from "next/link";
import { SMS_CONSENT_TEXT } from "@/lib/sms-public-opt-in";

/**
 * Renders SMS_CONSENT_TEXT with Terms → /terms and Privacy Policy → /privacy.
 * The linked words are the only markup; the sentence is otherwise exact.
 */
export function SmsConsentCopy({
  linkClassName = "underline underline-offset-2 hover:text-white",
}: {
  linkClassName?: string;
}) {
  const marker = "See our Terms and Privacy Policy.";
  const head = SMS_CONSENT_TEXT.slice(0, SMS_CONSENT_TEXT.indexOf(marker));
  return (
    <span>
      {head}
      See our{" "}
      <Link href="/terms" className={linkClassName}>
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className={linkClassName}>
        Privacy Policy
      </Link>
      .
    </span>
  );
}
