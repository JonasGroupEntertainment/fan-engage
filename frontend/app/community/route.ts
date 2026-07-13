import { NextResponse } from "next/server";
import { getPrimaryCommunityId } from "@/lib/data/fan";

export const dynamic = "force-dynamic";

/**
 * Community landing pages live at /artists/[slug]/community, so a static
 * nav link needs this resolver: send the fan to their own community, or
 * to the artist directory if they haven't joined one yet.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const communityId = await getPrimaryCommunityId();

  if (communityId) {
    return NextResponse.redirect(`${origin}/artists/${communityId}/community`);
  }
  return NextResponse.redirect(`${origin}/artists`);
}
