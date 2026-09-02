import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isForgotPasswordEnabled, isMagicLinkEnabled } from "@/lib/auth-doors";
import { createClient } from "@/lib/supabase/server";
import { signedInLoginRedirectPath } from "@/lib/session-presence";
import { LoginFallback, LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const supabase = await createClient();
    const cookieStore = await cookies();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const alreadyIn = signedInLoginRedirectPath({
      user,
      cookies: cookieStore.getAll(),
      nextPath: params.next,
    });
    if (alreadyIn) {
      redirect(alreadyIn);
    }
  }

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm
        magicLinkEnabled={isMagicLinkEnabled()}
        forgotPasswordEnabled={isForgotPasswordEnabled()}
      />
    </Suspense>
  );
}
