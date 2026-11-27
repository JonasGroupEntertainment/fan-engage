import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SIGNOUT_CONFIRM_PATH,
  SIGNOUT_REDIRECT_PATH,
  signOutCookieNames,
} from "@/lib/auth-signout";
import { isSameOriginRequest, sameOriginHeadersOf } from "@/lib/same-origin-request";

export const dynamic = "force-dynamic";

function expiredAuthCookie(name: string) {
  return {
    name,
    value: "",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax" as const,
    httpOnly: true,
    secure: true,
  };
}

/**
 * Opening the address does not sign anyone out. It sends the visitor to a
 * small page with a "Sign out" button that POSTs back here. No cookie is
 * touched and the session is not ended.
 */
function signOutConfirmRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL(SIGNOUT_CONFIRM_PATH, request.url), { status: 303 });
}

/** The real sign-out. Only a request sent by a page on this site counts. */
async function signOutAndRedirect(request: NextRequest) {
  if (!isSameOriginRequest(sameOriginHeadersOf(request.headers))) {
    return signOutConfirmRedirect(request);
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still expire cookies + redirect so a client/server mismatch cannot
    // leave the fan stuck signed in.
  }

  const destination = new URL(SIGNOUT_REDIRECT_PATH, request.url);
  const response = NextResponse.redirect(destination, { status: 303 });

  for (const name of signOutCookieNames(request.cookies.getAll())) {
    response.cookies.set(expiredAuthCookie(name));
  }

  return response;
}

export async function GET(request: NextRequest) {
  return signOutConfirmRedirect(request);
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}
