import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for the sister app "Fan Analytics Dashboard"
 * / "Super Fan Radar" (separate Supabase project, ref ysekxezezkucynjyvjwr,
 * live at fan-analytics-dashboard.vercel.app). This is a DIFFERENT Supabase
 * project than the one this repo normally talks to via lib/supabase — do
 * not mix them up.
 *
 * Server-side only. Never import into client components and never expose
 * the service role key to the browser.
 *
 * Required env vars (set these in Vercel — this repo does not otherwise
 * juggle multiple Supabase project refs, so we don't hardcode a URL
 * fallback and instead require both vars explicitly):
 *   - FAD_SUPABASE_URL              e.g. https://ysekxezezkucynjyvjwr.supabase.co
 *   - FAD_SUPABASE_SERVICE_ROLE_KEY (service role key — NEVER hardcode this)
 */
export function createSuperFanRadarClient() {
  const url = process.env.FAD_SUPABASE_URL;
  const serviceKey = process.env.FAD_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Super Fan Radar client is not configured. Set FAD_SUPABASE_URL and FAD_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
