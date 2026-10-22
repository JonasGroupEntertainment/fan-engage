import { LAUNCH_COMMUNITY_ID } from "./launch-catalog.ts";
import {
  isDurableImportAccount,
  RAELYNN_MEMBERSHIP_CONFLICT,
  raelynnMembershipRow,
  type AuthUserProbe,
} from "./imported-passwordless.ts";
import { createAdminClient } from "./supabase/admin.ts";

type MembershipWriter = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: { fan_id?: string } | null; error: { message: string } | null }>;
        };
      };
    };
    upsert: (
      row: ReturnType<typeof raelynnMembershipRow>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<{ error: { message: string } | null }>;
  };
  auth: {
    admin: {
      getUserById: (id: string) => Promise<{
        data: { user: AuthUserProbe | null };
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * Idempotent RaeLynn membership for an imported fan who does not have one.
 * No-op when a row already exists, when the account is not an import, or
 * when the lookup fails. Does not assign founding fan numbers.
 */
export async function ensureImportedFanRaelynnMembership(
  fanId: string,
  admin: MembershipWriter = createAdminClient() as unknown as MembershipWriter,
): Promise<void> {
  try {
    const existing = await admin
      .from("fan_community_memberships")
      .select("fan_id")
      .eq("fan_id", fanId)
      .eq("community_id", LAUNCH_COMMUNITY_ID)
      .maybeSingle();
    if (existing.error) {
      console.warn("membership: raelynn lookup failed");
      return;
    }
    if (existing.data?.fan_id) return;

    const { data, error } = await admin.auth.admin.getUserById(fanId);
    if (error || !data.user) {
      console.warn("membership: auth user lookup failed");
      return;
    }
    if (!isDurableImportAccount(data.user)) return;

    const { error: upsertError } = await admin.from("fan_community_memberships").upsert(
      raelynnMembershipRow(fanId, new Date().toISOString()),
      { onConflict: RAELYNN_MEMBERSHIP_CONFLICT, ignoreDuplicates: true },
    );
    if (upsertError) console.warn("membership: raelynn join was not saved");
  } catch {
    console.warn("membership: raelynn join was not saved");
  }
}
