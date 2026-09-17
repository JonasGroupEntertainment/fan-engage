import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import ForgotPasswordForm from "./forgot-password-form";

export const dynamic = "force-dynamic";

/**
 * Production HOLD until NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED=true.
 * Preview/dev keep the form so recovery can be proven. Login hides the
 * link in production; this route must not stay a public form there.
 */
export default function ForgotPasswordPage() {
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
      <ForgotPasswordForm />
    </Suspense>
  );
}
