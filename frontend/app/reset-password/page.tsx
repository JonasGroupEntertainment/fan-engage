import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import ResetPasswordForm from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <ResetPasswordForm forgotPasswordEnabled={isForgotPasswordEnabled()} />
  );
}
