"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isInviteCode } from "@/lib/invite-share";

/**
 * The signed-in fan's own invite code, or null for a visitor. Read once per
 * page load and shared by every share button on the page. It is read when
 * the page loads, not on the tap, because a phone only opens its share sheet
 * straight after a tap.
 */
let cached: Promise<string | null> | null = null;

const READ_FAILED = "useInviteCode: could not read the invite code";
const WATCH_FAILED = "useInviteCode: could not watch for sign-in changes";

async function readInviteCode(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    // Own row only (RLS: fans_self_select, auth.uid() = id).
    const { data, error } = await supabase
      .from("fans")
      .select("referral_code")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.warn(READ_FAILED, error.message);
      return null;
    }
    const code = (data?.referral_code as string | null | undefined) ?? null;
    return isInviteCode(code) ? code : null;
  } catch (err) {
    console.warn(READ_FAILED, err);
    return null;
  }
}

/** Auth events after which the cached code may belong to someone else. */
const FAN_CHANGED_EVENTS: readonly string[] = ["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"];

export function useInviteCode(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let isCurrent = true;
    const load = () => {
      cached ??= readInviteCode();
      const thisRead = cached;
      void thisRead.then((value) => {
        // A slower, older read must not overwrite a newer one.
        if (isCurrent && cached === thisRead) setCode(value);
      });
    };
    load();

    // A visitor who signs in without a page reload, or a different fan
    // signing in, must not share the address or code read before that.
    let unsubscribe = () => {};
    try {
      const { data } = createClient().auth.onAuthStateChange((event) => {
        if (!FAN_CHANGED_EVENTS.includes(event)) return;
        cached = null;
        // Drop the old code at once, before the new one is read.
        setCode(null);
        // Read after this callback returns: the auth client must not be
        // called from inside its own change handler.
        setTimeout(load, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (err) {
      console.warn(WATCH_FAILED, err);
    }

    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, []);
  return code;
}
