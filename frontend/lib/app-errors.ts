import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppErrorRow } from "@/lib/app-error-row";

const SAVE_TIMEOUT_MS = 1000;

/**
 * Saves one row to app_errors (migration 0114). Never
 * throws and gives up after 1 second, so recording an error can never
 * cause or slow down another one. If saving fails, the row still reaches
 * the Vercel log.
 */
export async function recordAppError(row: AppErrorRow): Promise<void> {
  try {
    const insert = createAdminClient().from("app_errors").insert(row);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ error: { message: string } }>((resolve) => {
      timer = setTimeout(() => resolve({ error: { message: "timed out" } }), SAVE_TIMEOUT_MS);
    });
    const { error } = await Promise.race([insert, timeout]).finally(() => clearTimeout(timer));
    if (error) console.warn("[app-errors] not saved:", error.message.slice(0, 120), JSON.stringify(row));
  } catch (err) {
    console.warn("[app-errors] not saved:", err instanceof Error ? err.message.slice(0, 120) : "error", JSON.stringify(row));
  }
}
