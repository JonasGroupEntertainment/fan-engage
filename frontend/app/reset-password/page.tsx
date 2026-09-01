import { notFound } from "next/navigation";
import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import ResetPasswordForm from "./reset-password-form";

/**
 * HOLD: password-reset email is PKCE. Do not leave a public set-password
 * form while recovery is off — same door as /forgot-password.
 */
export default function ResetPasswordPage() {
  if (!isForgotPasswordEnabled()) notFound();
  return (
    <ResetPasswordForm forgotPasswordEnabled={true} />
  );
}
