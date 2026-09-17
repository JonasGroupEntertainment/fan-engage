import { Suspense } from "react";
import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import AuthCompleteClient, {
  AuthCompleteFallback,
} from "./complete-client";

export const dynamic = "force-dynamic";

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<AuthCompleteFallback />}>
      <AuthCompleteClient forgotPasswordEnabled={isForgotPasswordEnabled()} />
    </Suspense>
  );
}
