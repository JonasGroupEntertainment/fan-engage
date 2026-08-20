import { NextResponse } from "next/server";
import { getCurrentCommunityId } from "@/lib/community";
import { getFoundingFanClaimState } from "@/lib/data/founding-fans";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const communityId = await getCurrentCommunityId();
    const state = await getFoundingFanClaimState(communityId);
    return NextResponse.json({
      filled: state.claimed,
      total: state.cap,
      remaining: state.remaining,
    });
  } catch (err) {
    console.error("[founder-slots] error", err);
    return NextResponse.json(
      { error: "Failed to fetch founder slots" },
      { status: 500 },
    );
  }
}
