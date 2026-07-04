import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gatherFanRecap, generateHypeLine } from "@/lib/recap/gather";

export const dynamic = "force-dynamic";

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/recap");

  const params = await searchParams;
  const admin = createAdminClient();

  // Resolve which community to recap: explicit ?community= (if the fan is
  // a member), else their sole membership, else "raelynn".
  const { data: memberships } = await admin
    .from("fan_community_memberships")
    .select("community_id")
    .eq("fan_id", user.id);
  const memberIds = ((memberships ?? []) as Array<{ community_id: string }>).map(
    (m) => m.community_id,
  );
  const communityId =
    params.community && memberIds.includes(params.community)
      ? params.community
      : memberIds.length === 1
        ? memberIds[0]
        : memberIds[0] ?? "raelynn";

  const recap = await gatherFanRecap(user.id, communityId);
  const hype = await generateHypeLine(recap);
  const maxSource = recap.sources[0]?.points ?? 1;

  return (
    <div className="min-h-screen bg-midnight">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-xs uppercase tracking-widest text-aurora">
          Your last 30 days · {recap.communityName}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">
          {recap.fanName ? `${recap.fanName}'s recap` : "Your recap"}
        </h1>
        <p className="mt-3 text-lg text-white/80">{hype}</p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Big label="Points earned" value={recap.pointsEarned30d} />
          <Big label="Days active" value={recap.activeDays30d} />
          <Big label="Current streak" value={recap.currentStreakDays} suffix="d" />
          <Big
            label="Community rank"
            value={recap.rank ?? 0}
            prefix={recap.rank ? "#" : ""}
            note={recap.rank ? `of ${recap.memberCount.toLocaleString()}` : "—"}
          />
        </div>

        {recap.sources.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
              Where your points came from
            </h2>
            <div className="space-y-2">
              {recap.sources.map((s) => (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-white/70">
                    {s.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-aurora to-purple-400"
                      style={{ width: `${Math.max(4, (s.points / maxSource) * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-sm font-semibold text-white">
                    {s.points.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {recap.badgesEarned30d.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
              Badges earned this month
            </h2>
            <div className="flex flex-wrap gap-2">
              {recap.badgesEarned30d.map((b) => (
                <span
                  key={b.slug}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white/80"
                >
                  {b.icon && <span aria-hidden>{b.icon}</span>}
                  {b.name}
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link
            href={`/${recap.communityId}`}
            className="rounded-xl bg-gradient-to-r from-aurora to-purple-500 px-5 py-2.5 text-sm font-semibold text-black"
          >
            Keep the streak going →
          </Link>
          <Link href="/rewards" className="text-sm text-white/60 hover:text-white">
            Spend your {recap.totalPoints.toLocaleString()} points
          </Link>
        </div>
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  prefix = "",
  suffix = "",
  note,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {prefix}
        {value.toLocaleString()}
        {suffix}
      </p>
      {note && <p className="text-xs text-white/40">{note}</p>}
    </div>
  );
}
