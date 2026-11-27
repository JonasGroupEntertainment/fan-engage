import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("error log wiring", () => {
  it("both error pages report what they caught", () => {
    for (const page of ["../app/error.tsx", "../app/global-error.tsx"]) {
      assert.match(read(page), /reportClientError\(error\)/, page);
    }
  });

  it("the intake route is rate limited before it reads the body", () => {
    const route = read("../app/api/client-error/route.ts");
    assert.ok(route.indexOf("clientErrorRateLimiter.check(") < route.indexOf("request.text()"));
    assert.match(route, /status: 429/);
  });

  it("the Errors page is for owners only", () => {
    assert.match(read("../app/admin/errors/page.tsx"), /if \(!ctx\?\.isSuperAdmin\) notFound\(\);/);
    assert.match(
      read("../app/admin/layout.tsx"),
      /href: "\/admin\/errors", label: "Errors", superAdminOnly: true/,
    );
  });

  it("server errors are saved and old rows are cleared daily", () => {
    assert.match(read("../instrumentation.ts"), /recordAppError\(row\)/);
    assert.match(read("../app/api/cron/daily-admin-brief/route.ts"), /purge_old_app_errors/);
  });

  it("the table is closed to fans and visitors", () => {
    const sql = read("../../supabase/migrations/0114_app_errors.sql");
    assert.match(sql, /enable row level security/);
    assert.match(sql, /revoke all on public\.app_errors from anon, authenticated/);
    assert.doesNotMatch(sql, /create policy/);
  });
});
