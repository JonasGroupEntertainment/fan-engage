import { listApplications } from "@/lib/data/applications";
import ApplicationActions from "./application-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Applications · Admin" };

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-300",
  in_review: "bg-aurora/30 text-white",
  approved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-rose-500/20 text-rose-300",
  waitlisted: "bg-white/10 text-white/70",
};

export default async function AdminApplicationsPage() {
  const apps = await listApplications();
  const counts = apps.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Artist applications
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Submissions from /for-artists/apply. Approve a pending row to record
          the slug, notify the team in Slack, and email the contact an
          onboarding link. Reject closes the row and notifies Slack.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["pending", "in_review", "approved", "rejected", "waitlisted"] as const).map(
          (s) => (
            <span
              key={s}
              className={`rounded-full px-3 py-1 ${STATUS_BADGE[s]}`}
            >
              {s}: {counts[s] ?? 0}
            </span>
          ),
        )}
      </div>

      {apps.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-white/55">
          No applications yet. Submissions land here as soon as someone hits
          the form at /for-artists/apply.
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li
              key={a.id}
              className="glass-card rounded-2xl p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold">{a.display_name}</p>
                  {a.tagline && (
                    <p className="mt-1 text-sm text-white/70">{a.tagline}</p>
                  )}
                  <p className="mt-2 text-xs text-white/50">
                    {a.contact_name} · {a.contact_email}
                    {a.contact_phone ? ` · ${a.contact_phone}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {new Date(a.created_at).toLocaleString()}
                    {a.genres?.length ? ` · ${a.genres.join(" / ")}` : ""}
                    {a.monthly_listeners
                      ? ` · ${a.monthly_listeners.toLocaleString()} monthly`
                      : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[a.status]}`}
                >
                  {a.status}
                </span>
              </div>

              {a.community_pitch && (
                <p className="mt-3 rounded-xl bg-black/30 p-3 text-xs text-white/65 whitespace-pre-line">
                  {a.community_pitch}
                </p>
              )}

              {a.social.length > 0 && (
                <p className="mt-3 text-xs text-white/55">
                  Social:{" "}
                  {a.social
                    .map((s) => `${s.label} (${s.href})`)
                    .join(" · ")}
                </p>
              )}

              {a.manager_name && (
                <p className="mt-2 text-xs text-white/55">
                  Manager: {a.manager_name}
                  {a.manager_email ? ` (${a.manager_email})` : ""}
                </p>
              )}

              {/* Phase F.1.B — review actions for pending rows;
                  reviewer trail for resolved rows. */}
              <div className="mt-4 border-t border-white/10 pt-3">
                {a.status === "pending" ? (
                  <ApplicationActions
                    applicationId={a.id}
                    defaultSlug={a.slug_suggestion ?? ""}
                    displayName={a.display_name}
                  />
                ) : a.reviewed_at ? (
                  <p className="text-xs text-white/55">
                    {a.status} ·{" "}
                    {new Date(a.reviewed_at).toLocaleString()}
                    {a.approved_slug ? ` · slug: ${a.approved_slug}` : ""}
                    {a.review_notes ? ` · "${a.review_notes}"` : ""}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
