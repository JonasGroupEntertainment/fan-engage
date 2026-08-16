"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

type SeedPost = {
  kind: "announcement" | "poll" | "challenge" | "post";
  title: string | null;
  body: string;
  pinned: boolean;
  visibility: "public" | "premium";
  poll_options?: string[];
};

const SEED_CONTENT: Record<string, SeedPost[]> = {
  raelynn: [
    {
      kind: "announcement",
      title: "Welcome to the RaeLynn community",
      body: "Hey everyone — this is your space. Share what RaeLynn's music means to you, swap setlist predictions, post your fan moments, and connect with other fans who get it. Drop a hello below and tell us where you're tuning in from.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "Which era of RaeLynn are you most into right now?",
      pinned: false,
      visibility: "public",
      poll_options: ["God Made Girls / Wildhorse era", "WildHorse album deep cuts", "BYE FELICIA", "Whatever she drops next"],
    },
    {
      kind: "challenge",
      title: "Show us your RaeLynn moment",
      body: "Post a photo or video from a RaeLynn show, a fan meet, or any memory tied to her music. Tag where it was taken and we'll feature the best ones. Top 3 get 500 bonus points.",
      pinned: false,
      visibility: "public",
    },
  ],
  "bailee-madison": [
    {
      kind: "announcement",
      title: "Welcome to the Bailee Madison fan community",
      body: "So glad you're here. Whether you found Bailee through Good Witch, Pretty Little Liars: Original Sin, or \"Kinda Fun\" — this is the place to connect, share, and stay closest to what she's working on. Introduce yourself below.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "How did you first discover Bailee?",
      pinned: false,
      visibility: "public",
      poll_options: ["Good Witch (Hallmark)", "Pretty Little Liars: Original Sin", "\"Kinda Fun\" single", "Film / other project"],
    },
    {
      kind: "challenge",
      title: "Favorite scene or lyric",
      body: "Share your favorite Bailee Madison scene, quote, or lyric from \"Kinda Fun\" — and tell us why it hit. Drop it as a reply and the community will react.",
      pinned: false,
      visibility: "public",
    },
  ],
  bailee: [
    {
      kind: "announcement",
      title: "Welcome — you're early",
      body: "This community is just getting started, and that makes you a founding fan. Drop a hello, tell us how you found Bailee's music, and let's build this together from the ground up.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "What kind of content do you want most from Bailee in this community?",
      pinned: false,
      visibility: "public",
      poll_options: ["Behind-the-scenes studio content", "Early access to new music", "Q&As and live chats", "Exclusive digital drops"],
    },
    {
      kind: "challenge",
      title: "Tell us what brought you here",
      body: "Post a short intro — where you're from, how you found Bailee's music, and one thing you're hoping to see in this community. Best intro gets pinned for a week.",
      pinned: false,
      visibility: "public",
    },
  ],
  blake: [
    {
      kind: "announcement",
      title: "Blake community is live",
      body: "Welcome in. This is the fan home base — closest to the music, first to know. Say hi, tell us where you're listening from, and let's get it going.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "What are you most excited to see from Blake next?",
      pinned: false,
      visibility: "public",
      poll_options: ["New singles / EP", "Tour dates", "Studio session content", "Collabs"],
    },
    {
      kind: "challenge",
      title: "First listen memory",
      body: "Tell us where you were and what you were doing the first time you heard a Blake track that stuck. Post your story — no wrong answers.",
      pinned: false,
      visibility: "public",
    },
  ],
  konnor: [
    {
      kind: "announcement",
      title: "Konnor community — you're founding this",
      body: "Being here now means you're a founding fan. This space is yours — for music talk, early access, and being close to what Konnor is building. Start the conversation: what's the track you keep going back to?",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "Where do you mostly stream Konnor's music?",
      pinned: false,
      visibility: "public",
      poll_options: ["Spotify", "Apple Music", "YouTube", "I buy it"],
    },
    {
      kind: "challenge",
      title: "Lyric that hit different",
      body: "Drop a Konnor lyric that meant something to you and the context around it — what you were going through, where you were. Best response gets featured.",
      pinned: false,
      visibility: "public",
    },
  ],
  "danger-twins": [
    {
      kind: "announcement",
      title: "Welcome to the Danger Twins community",
      body: "Amy Stroup and Andrew Bissell built something rare — two artists, one sound that's completely its own. This is the space for the fans who found it. Say hi, tell us how you discovered Danger Twins, and let's build the community together.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "What drew you to Danger Twins first?",
      pinned: false,
      visibility: "public",
      poll_options: ["Amy Stroup's solo work", "Andrew Bissell's music", "A Danger Twins track that found me", "Heard them live"],
    },
    {
      kind: "challenge",
      title: "The song that got you",
      body: "Tell us the Danger Twins track that stopped you in your tracks — and what you were doing when you first heard it. Best story gets featured and 300 bonus points.",
      pinned: false,
      visibility: "public",
    },
  ],
  "dan-marshall": [
    {
      kind: "announcement",
      title: "Dan Marshall community is live",
      body: "Welcome. This is the closest you can get to what Dan is building — music, stories, and the road between them. Drop a hello and tell us where you're tuning in from.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "Where do you mostly catch Dan Marshall's music?",
      pinned: false,
      visibility: "public",
      poll_options: ["Spotify / streaming", "Live shows", "Radio", "Social / YouTube"],
    },
    {
      kind: "challenge",
      title: "A line that stuck",
      body: "Post a Dan Marshall lyric that stayed with you — and the 2-3 sentences on why it hit. No wrong answers. Best one gets pinned for the week.",
      pinned: false,
      visibility: "public",
    },
  ],
  "hunter-hawkins": [
    {
      kind: "announcement",
      title: "Hunter Hawkins — you're here early",
      body: "This community is just getting started, which means you're a founding fan. Hunter is building something real and this is where fans get closest to it. Introduce yourself — where are you from and how did you find the music?",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "What kind of content do you want most from Hunter in this community?",
      pinned: false,
      visibility: "public",
      poll_options: ["Behind-the-scenes / studio", "New music early access", "Personal updates", "Live show announcements"],
    },
    {
      kind: "challenge",
      title: "First Hunter Hawkins memory",
      body: "Tell us where you were and what was going on when a Hunter Hawkins track first landed for you. The more specific, the better. Best story gets 500 bonus points.",
      pinned: false,
      visibility: "public",
    },
  ],
  dan: [
    {
      kind: "announcement",
      title: "Dan community is open",
      body: "Welcome, and thanks for being here early. This is where the real fan conversation lives — closer than social, more personal than a stream. Introduce yourself and let's get started.",
      pinned: true,
      visibility: "public",
    },
    {
      kind: "poll",
      title: null,
      body: "What's your favorite Dan sound?",
      pinned: false,
      visibility: "public",
      poll_options: ["Big country anthem", "Quiet storytelling", "Road-trip energy", "Whatever he makes next"],
    },
    {
      kind: "challenge",
      title: "Road trip track — yours and his",
      body: "Tell us the one Dan track you'd put on a long road trip and where you'd be driving. Post the track + the route. Best combo gets 300 bonus points.",
      pinned: false,
      visibility: "public",
    },
  ],
};

export async function seedCommunityAction(formData: FormData): Promise<void> {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) throw new Error("Super-admin only");

  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const posts = SEED_CONTENT[artistSlug];
  if (!posts) throw new Error(`No seed content defined for ${artistSlug}`);

  const admin = createAdminClient();

  // Idempotent: skip artists that already have posts.
  const { count } = await admin
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("artist_slug", artistSlug);
  if ((count ?? 0) > 0) {
    revalidatePath("/admin/community/seed");
    return;
  }

  for (const post of posts) {
    const { data: created, error } = await admin
      .from("community_posts")
      .insert({
        artist_slug: artistSlug,
        author_id: ctx.user.id,
        kind: post.kind,
        title: post.title,
        body: post.body,
        pinned: post.pinned,
        visibility: post.visibility,
      })
      .select("id")
      .single();

    if (error || !created) {
      throw new Error(`Failed to insert ${post.kind}: ${error?.message ?? "unknown"}`);
    }

    if (post.kind === "poll" && post.poll_options && post.poll_options.length > 0) {
      const { error: optErr } = await admin
        .from("community_poll_options")
        .insert(
          post.poll_options.map((label, i) => ({
            post_id: created.id,
            label,
            sort_order: i,
          })),
        );
      if (optErr) throw new Error(`Poll options insert failed: ${optErr.message}`);
    }
  }

  revalidatePath(`/artists/${artistSlug}/community`);
  revalidatePath("/admin/community/seed");
}

export async function getArtistSeedStatus(
  slugs: string[],
): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const result: Record<string, number> = {};

  await Promise.all(
    slugs.map(async (slug) => {
      const { count } = await admin
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("artist_slug", slug);
      result[slug] = count ?? 0;
    }),
  );

  return result;
}
