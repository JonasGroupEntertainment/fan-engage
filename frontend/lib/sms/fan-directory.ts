import { createAdminClient } from "@/lib/supabase/admin";
import type { SmsFanDirectory } from "./inbound.ts";
import { isMissingSmsParentConsentColumn } from "./policy.ts";

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Phone match used by the Mailchimp inbound webhook: load fans and compare
 * digits, because stored numbers and carrier numbers are not always the
 * same string. Deletes are not involved; this only reads and sets
 * sms_opted_in.
 */
export function supabaseSmsFanDirectory(): SmsFanDirectory {
  return {
    async findByPhone(from: string) {
      const wanted = digits(from);
      if (!wanted) return null;
      const admin = createAdminClient();
      let { data, error } = await admin
        .from("fans")
        .select("id, phone, birth_date, sms_parent_consent_at");
      if (error && isMissingSmsParentConsentColumn(error)) {
        const plain = await admin.from("fans").select("id, phone, birth_date");
        data = plain.data;
        error = plain.error;
      }
      if (error) throw new Error(error.message);
      const target = (data ?? []).find((fan) => digits(fan.phone as string | null) === wanted);
      if (!target) return null;
      const row = target as {
        id: string;
        birth_date?: string | null;
        sms_parent_consent_at?: string | null;
      };
      return {
        id: String(row.id),
        birthDate: row.birth_date ?? null,
        smsParentConsentAt: row.sms_parent_consent_at ?? null,
      };
    },
    async setOptIn(id: string, optedIn: boolean) {
      const admin = createAdminClient();
      const { error } = await admin.from("fans").update({ sms_opted_in: optedIn }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
