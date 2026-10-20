import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isFoundingFanNumber } from "./points/economy.ts";
import {
  evaluateRsvpWindow,
  formatRsvpOpensAt,
  FOUNDING_RSVP_EARLY_HOURS,
  foundingRsvpOpensAt,
  grantManagesEventRsvps,
  isMissingRsvpOpensColumn,
  rsvpClosedMessage,
  rsvpWindowView,
} from "./rsvp-window.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const OPENS = new Date("2026-10-25T22:00:00.000Z");
const EARLY = foundingRsvpOpensAt(OPENS);

function at(ms: number): Date {
  return new Date(ms);
}

describe("founding RSVP window", () => {
  it("opens 48 hours before the public RSVP time", () => {
    assert.equal(FOUNDING_RSVP_EARLY_HOURS, 48);
    assert.equal(EARLY.toISOString(), "2026-10-23T22:00:00.000Z");
  });

  it("treats a missing open time as open for everyone", () => {
    for (const rsvpOpensAt of [null, undefined, "", "   "]) {
      const decision = evaluateRsvpWindow({
        now: EARLY,
        rsvpOpensAt,
        foundingFanNumber: null,
      });
      assert.deepEqual(decision, {
        allowed: true,
        state: "open",
        reason: "unscheduled",
      });
    }
  });

  it("keeps non-founding fans closed until the public open, inclusive at the instant", () => {
    const before = evaluateRsvpWindow({
      now: at(OPENS.getTime() - 1),
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: null,
    });
    assert.equal(before.allowed, false);
    assert.equal(before.state, "closed");
    if (before.state === "closed") {
      assert.equal(before.audience, "general");
      assert.equal(before.opensAt, OPENS.toISOString());
      assert.match(rsvpClosedMessage(before), /^RSVP opens /);
    }

    const atOpen = evaluateRsvpWindow({
      now: OPENS,
      rsvpOpensAt: OPENS,
      foundingFanNumber: 0,
    });
    assert.deepEqual(atOpen, { allowed: true, state: "open", reason: "general" });
  });

  it("uses isFoundingFanNumber, including numbers above 100", () => {
    assert.equal(isFoundingFanNumber(1), true);
    assert.equal(isFoundingFanNumber(100), true);
    assert.equal(isFoundingFanNumber(101), true);
    assert.equal(isFoundingFanNumber(0), false);
    assert.equal(isFoundingFanNumber(null), false);

    const early = evaluateRsvpWindow({
      now: EARLY,
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: 101,
    });
    assert.equal(early.allowed, true);
    assert.equal(early.state, "early-access");
    if (early.state === "early-access") {
      assert.equal(early.generalOpensAt, OPENS.toISOString());
    }

    for (const foundingFanNumber of [0, null, undefined, -3]) {
      const closed = evaluateRsvpWindow({
        now: EARLY,
        rsvpOpensAt: OPENS.toISOString(),
        foundingFanNumber,
      });
      assert.equal(closed.state, "closed");
      if (closed.state === "closed") assert.equal(closed.audience, "general");
    }
  });

  it("opens early access on the 48-hour boundary and not one millisecond before", () => {
    const onBoundary = evaluateRsvpWindow({
      now: EARLY,
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: 4,
    });
    assert.equal(onBoundary.state, "early-access");

    const tooSoon = evaluateRsvpWindow({
      now: at(EARLY.getTime() - 1),
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: 4,
    });
    assert.equal(tooSoon.allowed, false);
    if (tooSoon.state === "closed") {
      assert.equal(tooSoon.audience, "founding");
      assert.equal(tooSoon.opensAt, EARLY.toISOString());
      assert.match(rsvpClosedMessage(tooSoon), /^Early access opens /);
    }
  });

  it("shows Early access during the head start and the public open time to everyone else", () => {
    const decision = evaluateRsvpWindow({
      now: at(EARLY.getTime() + 60_000),
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: 12,
    });
    const view = rsvpWindowView(decision);
    assert.equal(view.state, "early-access");
    assert.equal(view.closedMessage, null);
    assert.equal(view.everyoneElseOpensLabel, formatRsvpOpensAt(OPENS));

    const waiting = rsvpWindowView(
      evaluateRsvpWindow({
        now: at(OPENS.getTime() - 1),
        rsvpOpensAt: OPENS.toISOString(),
        foundingFanNumber: null,
      }),
    );
    assert.equal(waiting.state, "closed");
    assert.match(waiting.closedMessage ?? "", /^RSVP opens /);
  });

  it("lets an admin RSVP before either window, and still marks founding early access", () => {
    const adminEarly = evaluateRsvpWindow({
      now: at(EARLY.getTime() - 60_000),
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: null,
      isAdmin: true,
    });
    assert.deepEqual(adminEarly, { allowed: true, state: "open", reason: "admin" });
    assert.equal(rsvpWindowView(adminEarly).state, "admin");

    const foundingAdmin = evaluateRsvpWindow({
      now: EARLY,
      rsvpOpensAt: OPENS.toISOString(),
      foundingFanNumber: 2,
      isAdmin: true,
    });
    assert.equal(foundingAdmin.state, "early-access");
  });

  it("fails closed on an unreadable open time unless the viewer is an admin", () => {
    const fan = evaluateRsvpWindow({
      now: OPENS,
      rsvpOpensAt: "not-a-date",
      foundingFanNumber: 5,
    });
    assert.equal(fan.allowed, false);
    if (fan.state === "closed") {
      assert.equal(fan.opensAt, null);
      assert.equal(rsvpClosedMessage(fan), "RSVP isn't open yet");
    }
    const admin = evaluateRsvpWindow({
      now: OPENS,
      rsvpOpensAt: "not-a-date",
      foundingFanNumber: null,
      isAdmin: true,
    });
    assert.equal(admin.allowed, true);
  });

  it("formats the fan-facing open time in Eastern", () => {
    assert.equal(
      formatRsvpOpensAt(new Date("2026-10-23T23:00:00.000Z")),
      "Fri, Oct 23, 7:00 PM EDT",
    );
  });
});

describe("who may manage RSVPs outside the window", () => {
  it("allows editor, admin, owner, and super-admin grants only", () => {
    assert.equal(
      grantManagesEventRsvps([{ communityId: "raelynn", role: "editor" }], "raelynn"),
      true,
    );
    assert.equal(
      grantManagesEventRsvps([{ communityId: "raelynn", role: "admin" }], "raelynn"),
      true,
    );
    assert.equal(
      grantManagesEventRsvps([{ communityId: "raelynn", role: "owner" }], "raelynn"),
      true,
    );
    assert.equal(
      grantManagesEventRsvps([{ communityId: "*", role: "owner" }], "danger-twins"),
      true,
    );
    assert.equal(
      grantManagesEventRsvps([{ communityId: "raelynn", role: "viewer" }], "raelynn"),
      false,
    );
    assert.equal(
      grantManagesEventRsvps([{ communityId: "raelynn", role: "editor" }], "danger-twins"),
      false,
    );
    assert.equal(grantManagesEventRsvps([], "raelynn"), false);
  });
});

describe("window enforcement is on the server and in SQL", () => {
  const windowSrc = readRepo("./rsvp-window.ts");
  const actionSrc = readRepo("../app/artists/[slug]/rsvp-actions.ts");
  const migrationSql = readRepo("../../supabase/migrations/0079_founding_rsvp_window.sql");

  it("decides founding status with isFoundingFanNumber, not the paid founder flag", () => {
    assert.match(windowSrc, /isFoundingFanNumber/);
    assert.doesNotMatch(windowSrc, /isFounder|is_founder/);
    assert.match(migrationSql, /founding_fan_number >= 1/);
    assert.doesNotMatch(migrationSql, /is_founder/);
  });

  it("checks the window before inserting and still allows cancel", () => {
    const fn = actionSrc.slice(actionSrc.indexOf("export async function toggleRsvpAction"));
    const deleteAt = fn.indexOf(".delete(");
    const checkAt = fn.indexOf("evaluateRsvpWindow");
    const insertAt = fn.indexOf(".insert(");
    assert.ok(deleteAt > 0 && checkAt > deleteAt && insertAt > checkAt);
    assert.match(fn, /if \(!decision\.allowed\)/);
    assert.match(fn, /viewerFoundingFanNumber/);
    assert.match(fn, /viewerManagesEventRsvps/);
  });

  it("migration gates inserts 48 hours early and leaves the column unapplied by the app", () => {
    assert.match(migrationSql, /add column if not exists rsvp_opens_at timestamptz/);
    assert.match(migrationSql, /interval '48 hours'/);
    assert.match(migrationSql, /service_role/);
    assert.match(migrationSql, /'owner', 'admin', 'editor'/);
    assert.match(migrationSql, /raise exception 'RSVP is not open yet'/);
    assert.match(migrationSql, /NOT APPLIED/);
    assert.match(migrationSql, /event_rsvps_enforce_rsvp_window/);
  });

  it("detects a missing rsvp_opens_at column and ignores unrelated errors", () => {
    assert.equal(
      isMissingRsvpOpensColumn({
        code: "42703",
        message: "column artist_events.rsvp_opens_at does not exist",
      }),
      true,
    );
    assert.equal(
      isMissingRsvpOpensColumn({ code: "42703", message: "column artist_events.nope does not exist" }),
      false,
    );
    assert.equal(isMissingRsvpOpensColumn(null), false);
  });
});
