import { notFound } from "next/navigation";
import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import ForgotPasswordForm from "./forgot-password-form";

/**
 * HOLD: password-reset email is PKCE and not proven in production.
 * Login already hides the link; this route must not stay a public form.
 * Preview/dev keep the form so recovery can still be proven.
 */
export default function ForgotPasswordPage() {
  if (!isForgotPasswordEnabled()) notFound();
  return <ForgotPasswordForm />;
}
