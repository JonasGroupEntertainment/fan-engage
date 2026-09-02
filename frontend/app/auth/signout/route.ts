import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SIGNOUT_REDIRECT_PATH,
  signOutCookieNames,
} from "@/lib/auth-signout";

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

async function signOutAndRedirect(request: NextRequest) {
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
  return signOutAndRedirect(request);
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}
