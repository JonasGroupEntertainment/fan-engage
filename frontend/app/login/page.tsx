import { Suspense } from "react";
import { isMagicLinkEnabled } from "@/lib/auth-doors";
import { LoginFallback, LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm magicLinkEnabled={isMagicLinkEnabled()} />
    </Suspense>
  );
}
