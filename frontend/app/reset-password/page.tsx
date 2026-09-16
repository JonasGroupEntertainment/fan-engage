import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import ResetPasswordForm from "./reset-password-form";

export const dynamic = "force-dynamic";

/**
 * Production HOLD until NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED=true.
 * Do not leave a public set-password form while recovery is off — same
 * door as /forgot-password.
 */
export default function ResetPasswordPage() {
  if (!isForgotPasswordEnabled()) notFound();
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
          <div className="glass-card p-8 text-center text-sm text-white/60">
            Loading…
          </div>
        </main>
      }
    >
      <ResetPasswordForm forgotPasswordEnabled={true} />
    </Suspense>
  );
}
