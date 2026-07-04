import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalContext, roleAtLeast } from "@/lib/artist-portal/access";
import { addTeamMemberAction, removeTeamMemberAction } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Full control, including this team page",
  admin: "Day-to-day management — everything except the team",
  editor: "Can post, manage events and redemptions",
  viewer: "Read-only access to analytics and community",
};

export default async function TeamPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/login?next=/artist-portal/team");
  if (!roleAtLeast(ctx.role, "owner")) redirect("/artist-portal");

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("admin_users")
    .select("user_id, role, created_at")
    .eq("community_id", ctx.communityId)
    .order("created_at");

  const members = (rows ?? []) as Array<{
    user_id: string;
    role: string;
    created_at: string;
  }>;

  // Resolve emails/names from fans (fans.id == auth user id).
  const ids = members.map((m) => m.user_id);
  const { data: fans } = ids.length
    ? await admin.from("fans").select("id, email, display_name").in("id", ids)
    : { data: [] };
  const fanById = new Map(
    ((fans ?? []) as Array<{ id: string; email: string | null; display_name: string | null }>).map(
      (f) => [f.id, f],
    ),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Team
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Give your team access to the portal. They sign up on the fan site
          first, then you add them here by email.
        </p>
      </div>

      {/* Members list */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/50">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const fan = fanById.get(m.user_id);
              const isSelf = m.user_id === ctx.user.id;
              return (
                <tr key={m.user_id} className="border-b border-white/5">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">
                      {fan?.display_name || fan?.email || m.user_id.slice(0, 8)}
                      {isSelf && (
                        <span className="ml-2 text-xs text-white/40">(you)</span>
                      )}
                    </p>
                    {fan?.display_name && fan?.email && (
                      <p className="text-xs text-white/50">{fan.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs uppercase tracking-wide text-white/70">
                      {m.role}
                    </span>
                    <p className="mt-1 text-xs text-white/40">
                      {ROLE_DESCRIPTIONS[m.role] ?? ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && m.role !== "owner" && (
                      <form action={removeTeamMemberAction}>
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <button
                          type="submit"
                          className="text-xs text-red-300/70 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add member */}
      <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
        <h2 className="text-sm font-semibold text-white">Add a team member</h2>
        <form
          action={addTeamMemberAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <label className="flex-1 min-w-[220px]">
            <span className="mb-1 block text-xs text-white/50">Email</span>
            <input
              type="email"
              name="email"
              required
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/50">Role</span>
            <select
              name="role"
              defaultValue="editor"
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            Add member
          </button>
        </form>
        <p className="mt-3 text-xs text-white/40">
          They need a Fan Engage account first — send them to the fan site to
          sign up, then add their email here.
        </p>
      </div>
    </div>
  );
}
