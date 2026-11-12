import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clientSentryDsn,
  hasSentryDsn,
  isNextControlFlowError,
  reportableError,
  scrubPii,
  scrubSentryEvent,
  sentryTags,
  serverSentryDsn,
  stripUrlQuery,
} from "./sentry-report.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const FAN_ID = "11111111-1111-4111-8111-111111111111";

describe("sentry dsn", () => {
  it("treats blank values as unset", () => {
    const env = { SENTRY_DSN: "  ", NEXT_PUBLIC_SENTRY_DSN: "" } as NodeJS.ProcessEnv;
    assert.equal(serverSentryDsn(env), undefined);
    assert.equal(clientSentryDsn(env), undefined);
    assert.equal(hasSentryDsn(env), false);
  });

  it("prefers the server DSN and keeps it off the client", () => {
    const env = {
      SENTRY_DSN: "https://example.ingest.sentry.io/1",
      NEXT_PUBLIC_SENTRY_DSN: "https://example.ingest.sentry.io/2",
    } as NodeJS.ProcessEnv;
    assert.equal(serverSentryDsn(env), "https://example.ingest.sentry.io/1");
    assert.equal(clientSentryDsn(env), "https://example.ingest.sentry.io/2");
  });

  it("falls back to the public DSN on the server", () => {
    const env = { NEXT_PUBLIC_SENTRY_DSN: " https://example.ingest.sentry.io/2 " } as NodeJS.ProcessEnv;
    assert.equal(serverSentryDsn(env), "https://example.ingest.sentry.io/2");
    assert.equal(hasSentryDsn(env), true);
  });
});

describe("scrubPii", () => {
  it("removes emails, phones, and bearer tokens", () => {
    const text = scrubPii(
      "create failed for fan@example.com phone +15555550123 Authorization Bearer abc.def",
    );
    assert.equal(text.includes("fan@example.com"), false);
    assert.equal(text.includes("+15555550123"), false);
    assert.equal(text.includes("abc.def"), false);
    assert.match(text, /\[redacted-email\]/);
    assert.match(text, /\[redacted-phone\]/);
    assert.match(text, /Bearer \[redacted\]/);
  });

  it("strips query strings from urls", () => {
    assert.equal(
      stripUrlQuery("https://www.fanengagepro.com/premium?email=fan@example.com"),
      "https://www.fanengagepro.com/premium",
    );
  });
});

describe("sentry tags", () => {
  it("keeps route, step, and a fan uuid", () => {
    assert.deepEqual(
      sentryTags({
        route: "/premium",
        step: "checkout-session",
        fan_id: FAN_ID,
        code: "23505",
        event_type: "invoice.paid",
      }),
      {
        route: "/premium",
        step: "checkout-session",
        fan_id: FAN_ID,
        code: "23505",
        event_type: "invoice.paid",
      },
    );
  });

  it("drops emails and other non-uuid fan ids", () => {
    const tags = sentryTags({
      route: "/signup",
      step: "tag-internal-account",
      fan_id: "fan@example.com",
      code: "fan@example.com",
      event_type: "not a type",
    });
    assert.deepEqual(tags, { route: "/signup", step: "tag-internal-account" });
  });
});

describe("reportable errors", () => {
  it("scrubs an Error message and stack", () => {
    const error = new Error("duplicate fan@example.com");
    error.name = "AuthError";
    const reported = reportableError(error);
    assert.equal(reported.name, "AuthError");
    assert.equal(reported.message.includes("fan@example.com"), false);
    assert.match(reported.message, /\[redacted-email\]/);
  });

  it("uses a database error code as the name when there is no Error subclass", () => {
    const reported = reportableError({
      message: "signup failed for fan@example.com",
      code: "unexpected_failure",
    });
    assert.equal(reported.name, "unexpected_failure");
    assert.equal(reported.message.includes("@"), false);
  });
});

describe("next control flow", () => {
  it("recognizes redirects and ignores ordinary errors", () => {
    assert.equal(
      isNextControlFlowError(Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;replace;/premium;307;",
      })),
      true,
    );
    assert.equal(isNextControlFlowError(new Error("Community missing")), false);
    assert.equal(isNextControlFlowError(Object.assign(new Error("boom"), { digest: "abc123" })), false);
  });

  it("follows a cause chain so a wrapped redirect is not reported", () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/signup;307;",
    });
    assert.equal(isNextControlFlowError(new Error("wrapper", { cause: redirectError })), true);
  });
});

describe("sentry event scrub", () => {
  it("drops emails, request bodies, cookies, and non-uuid users", () => {
    const event = scrubSentryEvent({
      message: "failed for fan@example.com",
      user: { id: "fan@example.com", email: "fan@example.com", ip_address: "203.0.113.8" },
      request: {
        url: "https://www.fanengagepro.com/api/stripe/webhook?email=fan@example.com",
        cookies: { session: "secret" },
        data: { email: "fan@example.com" },
        query_string: "email=fan@example.com",
        headers: {
          cookie: "session=secret",
          authorization: "Bearer token",
          "stripe-signature": "t=1",
          "content-type": "application/json",
        },
      },
      exception: { values: [{ value: "User fan@example.com already registered" }] },
      breadcrumbs: [
        { category: "console", message: "fan@example.com", data: { email: "fan@example.com" } },
        { category: "http", message: "POST fan@example.com", data: { body: "fan@example.com" } },
      ],
      contexts: { nextjs: { request_path: "/premium?email=fan@example.com" } },
    });

    assert.equal(JSON.stringify(event).includes("fan@example.com"), false);
    assert.equal(event.user && "email" in event.user, false);
    assert.equal(event.user && "ip_address" in event.user, false);
    assert.equal(event.request?.cookies, undefined);
    assert.equal(event.request?.data, undefined);
    assert.equal(event.request?.query_string, undefined);
    assert.equal(event.request?.headers?.cookie, undefined);
    assert.equal(event.request?.headers?.authorization, undefined);
    assert.equal(event.request?.headers?.["stripe-signature"], undefined);
    assert.equal(event.request?.url?.includes("?"), false);
    assert.equal(event.breadcrumbs?.some((crumb) => crumb.category === "console"), false);
    assert.equal(event.breadcrumbs?.[0]?.data, undefined);
    assert.equal(
      (event.contexts as { nextjs: { request_path: string } }).nextjs.request_path.includes("?"),
      false,
    );
  });

  it("keeps a fan uuid on the user", () => {
    const event = scrubSentryEvent({ user: { id: FAN_ID, email: "fan@example.com" } });
    assert.deepEqual(event.user, { id: FAN_ID });
  });
});

describe("sentry wiring", () => {
  const signupRoute = readRepo("../app/api/auth/signup-error/route.ts");
  const signupAction = readRepo("../app/signup/tag-internal-account.ts");
  const tagHelper = readRepo("./internal-account-tag.ts");
  const checkout = readRepo("../app/premium/actions.ts");
  const webhook = readRepo("../app/api/stripe/webhook/route.ts");
  const sentry = readRepo("./sentry.ts");
  const init = readRepo("./sentry-init.ts");
  const instrumentation = readRepo("../instrumentation.ts");
  const client = readRepo("../instrumentation-client.ts");
  const nextConfig = readRepo("../next.config.ts");
  const envExample = readRepo("../.env.example");

  it("captures through Sentry.captureException and stays off without a DSN", () => {
    assert.match(sentry, /Sentry\.captureException\(reportableError\(error\), \{ tags: sentryTags\(tags\) \}\)/);
    assert.match(sentry, /if \(!hasSentryDsn\(\)\) return/);
    assert.match(init, /if \(!dsn\) return/);
    assert.match(init, /userInfo: false/);
    assert.match(init, /httpBodies: \[\]/);
    assert.match(init, /stackFrameVariables: false/);
    assert.match(init, /tracesSampleRate: 0/);
    assert.doesNotMatch(init, /sendDefaultPii/);
    assert.match(instrumentation, /if \(!hasSentryDsn\(\)\) return/);
    assert.match(instrumentation, /Sentry\.captureRequestError/);
    assert.match(client, /initSentry\("client"\)/);
    assert.doesNotMatch(nextConfig, /withSentryConfig/);
    assert.doesNotMatch(nextConfig, /SENTRY_AUTH_TOKEN/);
    assert.match(envExample, /^SENTRY_DSN=$/m);
    assert.match(envExample, /^NEXT_PUBLIC_SENTRY_DSN=$/m);
  });

  it("reports signup failures with route and step and keeps the server log", () => {
    assert.match(signupRoute, /console\.error\("\[signup\] rate limit unavailable", error\)/);
    assert.match(signupRoute, /console\.error\("\[signup\] create failed", \{ code, message \}\)/);
    assert.match(signupRoute, /step: "rate-limit"/);
    assert.match(signupRoute, /step: "backend-unavailable"/);
    assert.match(signupRoute, /step: "create-failed"/);
    assert.match(signupRoute, /route: "\/api\/auth\/signup-error"/);
    assert.match(signupAction, /console\.warn\("signup: internal account tag was not saved"\)/);
    assert.match(signupAction, /step: "tag-internal-account"/);
    assert.match(signupAction, /fan_id: fanId/);
    assert.match(tagHelper, /console\.warn\("signup: internal account tag was not saved"\)/);
    assert.match(tagHelper, /step: "tag-internal-account"/);
    assert.doesNotMatch(signupRoute, /fan_id/);
  });

  it("reports checkout failures without treating redirects as errors", () => {
    assert.match(checkout, /if \(isNextControlFlowError\(error\)\) throw error;/);
    const guard = checkout.indexOf("if (isNextControlFlowError(error)) throw error;");
    const capture = checkout.indexOf("captureAppException(error, {");
    assert.ok(guard > 0 && capture > guard);
    assert.match(checkout, /route: "\/premium"/);
    assert.match(checkout, /fan_id: fanId/);
    assert.match(checkout, /pickPriceId\(community, billingPeriod\)/);
  });

  it("reports webhook failures without sending the signature error or payload", () => {
    assert.match(webhook, /console\.warn\(stripeSignatureFailureWarning\(err\)\)/);
    assert.match(webhook, /console\.error\(`stripe\/webhook: \$\{event\.type\} handler failed`, processError\)/);
    assert.match(webhook, /step: "missing-secret"/);
    assert.match(webhook, /step: "verify-signature"/);
    assert.match(webhook, /step: "insert-event"/);
    assert.match(webhook, /step: "handler"/);
    const verify = webhook.slice(
      webhook.indexOf("} catch (err) {"),
      webhook.indexOf('{ error: "bad signature" }'),
    );
    assert.match(verify, /new Error\(stripeSignatureFailureWarning\(err\)\)/);
    assert.doesNotMatch(verify, /captureAppException\(err/);
  });
});
