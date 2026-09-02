import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveCommunityFromHost } from "@/lib/community";
import { productionHostRedirect, requestHostname } from "@/lib/canonical-host";
import { guestSignupHref, isOnboardingPath } from "@/lib/guest-signup";
import { isSignOutPath } from "@/lib/auth-signout";

/**
 * Routes a signed-in user must be able to reach.
 * Everything else under /app that's not here or public is open.
 *
 * Note: /rewards, /marketplace, /referrals are intentionally NOT in this
 * list — those pages render a public-preview marketing variant for
 * anonymous visitors (with a signup banner) and the full app variant for
 * signed-in fans. Removing them from the gate is what enables the
 * preview pattern; the pages themselves do their own auth-aware render.
 */
const PROTECTED_PREFIXES = ["/admin", "/inbox"] as const;

/**
 * Optional extra protection: a second HTTP Basic Auth layer on /admin/*.
 * Set ADMIN_BASIC_USER + ADMIN_BASIC_PASS in Vercel to enable. When not
 * set the route still falls through to the Supabase + ADMIN_EMAILS gate
 * in getAdminUser, so dev flows aren't blocked.
 */
function enforceAdminBasicAuth(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith("/admin")) return null;
  const user = process.env.ADMIN_BASIC_USER;
  const pass = process.env.ADMIN_BASIC_PASS;
  if (!user || !pass) return null;

  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(header.slice(6).trim());
      const [u, ...rest] = decoded.split(":");
      const p = rest.join(":");
      if (u === user && p === pass) return null; // pass through
    } catch {
      /* fallthrough to challenge */
    }
  }

  return new NextResponse("Admin access required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Fan Engage Admin", charset="UTF-8"',
    },
  });
}

/**
 * Refreshes the Supabase session on every request and redirects unauthenticated
 * users away from protected routes to /login.
 *
 * If Supabase env vars aren't set yet (e.g. on a PR preview before keys are
 * wired) the middleware becomes a no-op instead of crashing the whole app —
 * so previews of non-protected routes still work end-to-end.
 */
export async function middleware(request: NextRequest) {
  // Layer -1: pin production to www. next.config host rules did not fire
  // on live Vercel (pearl + apex still 200 on 2026-08-26). Same-path 308.
  const hostRedirect = productionHostRedirect(
    requestHostname(request.headers),
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (hostRedirect) {
    return NextResponse.redirect(hostRedirect, 308);
  }

  // Layer 0: optional HTTP Basic Auth on /admin/*
  const basicAuthBlock = enforceAdminBasicAuth(request);
  if (basicAuthBlock) return basicAuthBlock;

  // Layer 1: resolve the community from the hostname and stamp it on the
  // request so downstream RSCs / server actions can scope their queries
  // via lib/community.ts::getCurrentCommunityId(). For fan-engage-pearl
  // and localhost the resolver returns the DEFAULT (raelynn), preserving
  // single-tenant behavior until wildcard DNS is pointed at the platform.
  const communityId = resolveCommunityFromHost(request.headers.get("host"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-community-id", communityId);
  // Stamp the pathname so layouts can read it via headers() without
  // relying on unreliable x-invoke-path / next-url headers.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Sign-out must be able to expire auth cookies. getUser() below refreshes
  // the session and would write those cookies back onto the response.
  if (isSignOutPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // Re-propagate the x-community-id header stamp when Supabase
        // refreshes the session — otherwise it gets lost during the
        // NextResponse.next() call and downstream RSCs fall back to
        // the default community.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Guests must not sit on /onboarding "Loading…". Signup first; keep
  // ref/next when present (default ref=raelynn).
  if (!user && isOnboardingPath(pathname)) {
    const signup = guestSignupHref({
      ref: request.nextUrl.searchParams.get("ref"),
      next: request.nextUrl.searchParams.get("next"),
      fallbackNext: pathname,
    });
    return NextResponse.redirect(new URL(signup, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets / image optimization / favicon.
    // Note: api/fan-engage is explicitly excluded here — rate limiting is
    // handled at the route level (route.ts files) instead.
    "/((?!_next/static|_next/image|favicon.ico|api/fan-engage).*)",
  ],
};
