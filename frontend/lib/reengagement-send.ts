/**
 * One transactional email. Not a list broadcast.
 * Logs the provider status only — never the recipient, the API key, or the body.
 */

const KNOWN_STATUSES = new Set(["sent", "queued", "rejected", "invalid", "scheduled"]);

export async function sendTransactionalEmail(input: {
  apiKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  fromEmail?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; status: number | null }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl("https://mandrillapp.com/api/1.0/messages/send.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: input.apiKey,
        message: {
          subject: input.subject,
          text: input.text,
          html: input.html,
          from_email: input.fromEmail ?? "no-reply@fanengage.app",
          from_name: "Fan Engage",
          to: [{ email: input.to, type: "to" }],
        },
      }),
    });
    if (!res.ok) {
      console.warn(`reengagement: email provider returned ${res.status}`);
      return { ok: false, status: res.status };
    }
    const body = (await res.json().catch(() => null)) as
      | Array<{ status?: string }>
      | null;
    const raw = Array.isArray(body) ? body[0]?.status : undefined;
    const status = typeof raw === "string" && KNOWN_STATUSES.has(raw) ? raw : "unknown";
    if (status !== "sent" && status !== "queued") {
      console.warn(`reengagement: email provider status ${status}`);
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch {
    console.warn("reengagement: email provider request failed");
    return { ok: false, status: null };
  }
}
