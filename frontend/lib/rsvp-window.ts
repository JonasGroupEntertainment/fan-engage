/**
 * Founding Fan 48-hour early RSVP.
 *
 * `artist_events.rsvp_opens_at` is when everyone else can RSVP.
 * A Founding Fan — the same `isFoundingFanNumber` check as points and
 * the badge — can RSVP 48 hours before that. An empty open time means
 * RSVP is open now, which is how every existing event behaves.
 *
 * Admins (editor and above, including super-admins) can still RSVP so
 * they can manage the list. Viewers cannot skip the window.
 */

import { roleAtLeast, type AdminRole } from "./admin-authz.ts";
import { isFoundingFanNumber } from "./points/economy.ts";

export const FOUNDING_RSVP_EARLY_HOURS = 48;
export const FOUNDING_RSVP_EARLY_MS = FOUNDING_RSVP_EARLY_HOURS * 60 * 60 * 1000;

/** Roles that may RSVP outside the fan window. Matches the SQL trigger. */
export const RSVP_MANAGER_ROLES = ["editor", "admin", "owner"] as const;

export type RsvpWindowDecision =
  | {
      allowed: true;
      state: "open";
      /** `unscheduled` = no rsvp_opens_at. `general` = the public time has passed. */
      reason: "unscheduled" | "general" | "admin";
    }
  | {
      allowed: true;
      state: "early-access";
      /** When RSVP opens for everyone else (ISO). */
      generalOpensAt: string;
    }
  | {
      allowed: false;
      state: "closed";
      /** When this viewer can RSVP. Null when the stored time is unreadable. */
      opensAt: string | null;
      audience: "founding" | "general";
    };

export type RsvpWindowView = {
  state: "open" | "early-access" | "closed" | "admin";
  /** Shown when this viewer cannot RSVP yet. */
  closedMessage: string | null;
  /** Eastern label for the public open, set during Early access. */
  everyoneElseOpensLabel: string | null;
};

type ParsedOpens =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "at"; at: Date };

function parseOpensAt(value: string | Date | null | undefined): ParsedOpens {
  if (value == null) return { kind: "none" };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { kind: "invalid" } : { kind: "at", at: value };
  }
  const trimmed = value.trim();
  if (!trimmed) return { kind: "none" };
  const at = new Date(trimmed);
  if (Number.isNaN(at.getTime())) return { kind: "invalid" };
  return { kind: "at", at };
}

export function foundingRsvpOpensAt(generalOpensAt: Date): Date {
  return new Date(generalOpensAt.getTime() - FOUNDING_RSVP_EARLY_MS);
}

/**
 * Decide whether this viewer may insert an RSVP right now.
 * `foundingFanNumber` is the membership number for the event's artist.
 * Pass the result through `isFoundingFanNumber` — do not re-derive it.
 */
export function evaluateRsvpWindow(input: {
  now: Date;
  rsvpOpensAt: string | Date | null | undefined;
  foundingFanNumber: number | null | undefined;
  isAdmin?: boolean;
}): RsvpWindowDecision {
  const isAdmin = input.isAdmin === true;
  const parsed = parseOpensAt(input.rsvpOpensAt);

  if (parsed.kind === "none") {
    return { allowed: true, state: "open", reason: "unscheduled" };
  }
  if (parsed.kind === "invalid") {
    if (isAdmin) return { allowed: true, state: "open", reason: "admin" };
    return { allowed: false, state: "closed", opensAt: null, audience: "general" };
  }

  const opens = parsed.at;
  const early = foundingRsvpOpensAt(opens);
  const nowMs = input.now.getTime();
  const founding = isFoundingFanNumber(input.foundingFanNumber);

  if (nowMs >= opens.getTime()) {
    return { allowed: true, state: "open", reason: "general" };
  }
  if (founding && nowMs >= early.getTime()) {
    return {
      allowed: true,
      state: "early-access",
      generalOpensAt: opens.toISOString(),
    };
  }
  if (isAdmin) {
    return { allowed: true, state: "open", reason: "admin" };
  }
  if (founding) {
    return {
      allowed: false,
      state: "closed",
      opensAt: early.toISOString(),
      audience: "founding",
    };
  }
  return {
    allowed: false,
    state: "closed",
    opensAt: opens.toISOString(),
    audience: "general",
  };
}

/** Fan-facing clock. Event timestamps are stored in UTC; fans read Eastern. */
export function formatRsvpOpensAt(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

export function rsvpClosedMessage(
  decision: Extract<RsvpWindowDecision, { state: "closed" }>,
): string {
  if (!decision.opensAt) return "RSVP isn't open yet";
  const label = formatRsvpOpensAt(new Date(decision.opensAt));
  return decision.audience === "founding"
    ? `Early access opens ${label}`
    : `RSVP opens ${label}`;
}

export function rsvpWindowView(decision: RsvpWindowDecision): RsvpWindowView {
  if (decision.state === "early-access") {
    return {
      state: "early-access",
      closedMessage: null,
      everyoneElseOpensLabel: formatRsvpOpensAt(new Date(decision.generalOpensAt)),
    };
  }
  if (decision.state === "closed") {
    return {
      state: "closed",
      closedMessage: rsvpClosedMessage(decision),
      everyoneElseOpensLabel: null,
    };
  }
  if (decision.reason === "admin") {
    return { state: "admin", closedMessage: null, everyoneElseOpensLabel: null };
  }
  return { state: "open", closedMessage: null, everyoneElseOpensLabel: null };
}

export type RsvpAdminGrant = {
  communityId: string;
  role: string | null;
};

function asAdminRole(role: string | null): AdminRole | null {
  if (role === "owner" || role === "admin" || role === "editor" || role === "viewer") {
    return role;
  }
  return null;
}

/**
 * Editor, admin, or owner of this artist — or a super-admin (`*`) —
 * may RSVP before the fan window. Viewers may look at the list only.
 */
export function grantManagesEventRsvps(
  grants: readonly RsvpAdminGrant[],
  artistSlug: string,
): boolean {
  if (!artistSlug) return false;
  return grants.some((grant) => {
    if (grant.communityId !== artistSlug && grant.communityId !== "*") return false;
    return roleAtLeast(asAdminRole(grant.role), "editor");
  });
}

/** PostgREST / Postgres error for a database that does not have the column yet. */
export function isMissingRsvpOpensColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  return /rsvp_opens_at/i.test(error.message ?? "");
}
