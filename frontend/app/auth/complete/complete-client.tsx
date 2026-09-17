"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  authCallbackErrorPath,
  authCallbackIncompleteMessage,
  authCallbackUserMessage,
  parseAuthCallbackSearch,
} from "@/lib/auth-callback";
import { createClient } from "@/lib/supabase/client";

export function AuthCompleteFallback() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="glass-card p-8 text-center text-sm text-white/60">
        Completing sign-in…
      </div>
    </main>
  );
}

export default function AuthCompleteClient({
  forgotPasswordEnabled,
}: {
  forgotPasswordEnabled: boolean;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const parsed = parseAuthCallbackSearch(searchParams);
      const fail = (text: string) => {
        if (cancelled) return;
        window.location.replace(
          authCallbackErrorPath({
            next: parsed.next,
            message: text,
            forgotPasswordEnabled,
          }),
        );
      };

      try {
        const supabase = createClient();

        if (parsed.tokenHash && parsed.type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: parsed.tokenHash,
            type: parsed.type,
          });
          if (error) throw error;
        } else if (parsed.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            parsed.code,
          );
          if (error) throw error;
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            const found = await waitForBrowserSession(supabase);
            if (!found) {
              fail(authCallbackIncompleteMessage(parsed.next));
              return;
            }
          }
        }

        if (cancelled) return;
        window.location.replace(parsed.next);
      } catch {
        fail(authCallbackUserMessage(parsed.next));
      }
    }

    complete();
    return () => {
      cancelled = true;
    };
  }, [forgotPasswordEnabled, searchParams]);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="glass-card p-8 text-center text-sm text-white/60">
        Completing sign-in…
      </div>
    </main>
  );
}

async function waitForBrowserSession(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return true;

  return await new Promise((resolve) => {
    let subscription = { unsubscribe() {} };
    const timeout = setTimeout(() => {
      subscription.unsubscribe();
      resolve(false);
    }, 1500);
    subscription = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (
        nextSession &&
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "PASSWORD_RECOVERY")
      ) {
        clearTimeout(timeout);
        subscription.unsubscribe();
        resolve(true);
      }
    }).data.subscription;
  });
}
