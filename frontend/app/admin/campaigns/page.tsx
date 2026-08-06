import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { deactivateCampaignAction } from "./actions";

export const dynamic = "force-dynamic";

async function loadCampaigns() {
  const admin = createAdminClient();
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id,artist_slug,title,description,published_at,ends_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!campaigns || campaigns.length === 0) return [];

  const ids = campaigns.map((c) => c.id as string);
  const { data: items } = await admin
    .from("campaign_items")
    .select("campaign_id,item_kind,metadata")
    .in("campaign_id", ids);

  const itemCounts = new Map<string, Record<string, number>>();
  const broadcastStats = new Map<string, { emailSent?: number; emailFailed?: string | null; smsSent?: number; smsFailed?: string | null }>();
  for (const it of items ?? []) {
    const map = itemCounts.get(it.campaign_id as string) ?? {};
    const kind = it.item_kind as string;
    map[kind] = (map[kind] ?? 0) + 1;
    itemCounts.set(it.campaign_id as string, map);

    if (kind === "email" || kind === "sms") {
      const meta = (it.metadata ?? {}) as { sent?: number; error?: string | null };
      const stats = broadcastStats.get(it.campaign_id as string) ?? {};
      if (kind === "email") {
        stats.emailSent = meta.sent;
        stats.emailFailed = meta.error ?? null;
      } else {
        stats.smsSent = meta.sent;
        stats.smsFailed = meta.error ?? null;
      }
      broadcastStats.set(it.campaign_id as string, stats);
    }
  }
  return campaigns.map((c) => ({
    ...c,
    items: itemCounts.get(c.id as string) ?? {},
    broadcast: broadcastStats.get(c.id as string) ?? {},
  }));
}

function itemBadge(kind: string, count: number) {
  const toneMap: Record<string, string> = {
    announcement: "bg-sky-500/20 text-sky-200",
    poll: "bg-fuchsia-500/20 text-fuchsia-200",
    challenge: "bg-amber-500/20 text-amber-200",
    offer: "bg-emerald-500/20 text-emerald-200",
    action: "bg-purple-500/20 text-purple-200",
    event: "bg-rose-500/20 text-rose-200",
    email: "bg-blue-500/20 text-blue-200",
    sms: "bg-green-500/20 text-green-200",
    badge: "bg-yellow-500/20 text-yellow-200",
  };
  const tone = toneMap[kind] ?? "bg-white/10 text-white/70";
  return (
    <span key={kind} className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${tone}`}>
      {kind}
      {count > 1 && <span className="ml-1">·{count}</span>}
    </span>
  );
}

export default async function AdminCampaignsPage() {
  const campaigns = await loadCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Campaigns
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Bundle announcements, polls, challenges, offers, and fan CTAs into a single coordinated drop.
          </p>
        </div>
        <Link
          href="/admin/campaigns/new"
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2 text-sm font-semibold text-white shadow-glass hover:brightness-110"
        >
          + New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
          <p className="text-sm font-semibold">No campaigns yet</p>
          <p className="mt-2 text-xs text-white/60">
            Create your first campaign to publish an announcement, poll, challenge, offer, and fan CTAs in one shot.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const active = !c.ends_at;
            return (
              <div
                key={c.id as string}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-white/70">
                        /{c.artist_slug as string}
                      </span>
                      {active ? (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-emerald-200">
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-white/50">
                          Ended
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold">{c.title as string}</h2>
                    {c.description && (
                      <p className="mt-1 text-sm text-white/70">{c.description as string}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(c.items).length === 0 ? (
                        <span className="text-xs text-white/50">No items</span>
                      ) : (
                        Object.entries(c.items).map(([kind, count]) => itemBadge(kind, count))
                      )}
                    </div>
                    <p className="mt-2 text-xs text-white/50">
                      {c.published_at
                        ? `Published ${new Date(c.published_at as string).toLocaleString()}`
                        : "Draft"}
                    </p>
                    {(c.broadcast.emailSent != null || c.broadcast.smsSent != null) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {c.broadcast.emailSent != null && (
                          <span className={c.broadcast.emailFailed ? "text-rose-300" : "text-emerald-300"}>
                            ✉️ {c.broadcast.emailFailed ? `failed: ${c.broadcast.emailFailed.slice(0, 60)}` : `sent · ${c.broadcast.emailSent} recipients`}
                          </span>
                        )}
                        {c.broadcast.smsSent != null && (
                          <span className={c.broadcast.smsFailed ? "text-rose-300" : "text-emerald-300"}>
                            💬 {c.broadcast.smsFailed ? `failed: ${c.broadcast.smsFailed.slice(0, 60)}` : `sent · ${c.broadcast.smsSent} recipients`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {active && (
                    <form action={deactivateCampaignAction}>
                      <input type="hidden" name="campaign_id" value={c.id as string} />
                      <button className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10">
                        End campaign
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
