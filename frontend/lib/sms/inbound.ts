import {
  SMS_START_REPLY,
  classifySmsKeyword,
  smsHelpReply,
  type SmsKeyword,
} from "./keywords.ts";
import { smsAgeAllowsSend } from "./policy.ts";

export type SmsFanRecord = {
  id: string;
  birthDate: string | null;
};

export type SmsFanDirectory = {
  findByPhone(from: string): Promise<SmsFanRecord | null>;
  setOptIn(id: string, optedIn: boolean): Promise<void>;
};

export type InboundOutcome = {
  action: SmsKeyword;
  /**
   * Text we would send back. Null by default: Mailchimp auto-answers
   * HELP and STOP on 10DLC, and a START from an unknown number is a no-op.
   */
  reply: string | null;
  /** Local opt-in after this message, when a fan row changed. */
  optedIn: boolean | null;
  fanId: string | null;
  /**
   * false pushes the number onto the Mailchimp denylist.
   * true removes it. null leaves the shared denylist alone.
   * Unknown numbers stay null so a Brand Engage fan is not trapped.
   */
  providerOptIn: boolean | null;
  /** Known fan under 18. Not opted in and not texted. */
  underAge: boolean;
};

/**
 * Apply one inbound keyword for a Fan Engage fan.
 *
 * STOP opts that fan out even though the event is also forwarded to
 * Brand Engage. A number with no Fan Engage fan is left unchanged.
 * START from an unknown number is a no-op. A known under-18 fan is
 * never opted back in and is kept on the denylist.
 * HELP and START replies are returned only when the caller sets
 * sendKeywordReplies. STOP never gets a reply from us.
 */
export async function handleInboundSms(input: {
  from: string;
  text: string;
  directory: SmsFanDirectory;
  supportEmail: string;
  now?: Date;
  sendKeywordReplies?: boolean;
}): Promise<InboundOutcome> {
  const action = classifySmsKeyword(input.text);
  if (action === "other") {
    return {
      action,
      reply: null,
      optedIn: null,
      fanId: null,
      providerOptIn: null,
      underAge: false,
    };
  }
  const fan = await input.directory.findByPhone(input.from);
  const repliesOn = input.sendKeywordReplies === true;
  const underAge = Boolean(fan && !smsAgeAllowsSend(fan.birthDate, input.now));

  if (action === "stop") {
    if (fan) await input.directory.setOptIn(fan.id, false);
    return {
      action,
      reply: null,
      optedIn: fan ? false : null,
      fanId: fan?.id ?? null,
      providerOptIn: fan ? false : null,
      underAge: false,
    };
  }

  if (action === "help") {
    return {
      action,
      reply: repliesOn && !underAge ? smsHelpReply(input.supportEmail) : null,
      optedIn: null,
      fanId: fan?.id ?? null,
      providerOptIn: null,
      underAge,
    };
  }

  if (!fan) {
    return {
      action: "start",
      reply: null,
      optedIn: null,
      fanId: null,
      providerOptIn: null,
      underAge: false,
    };
  }

  if (underAge) {
    return {
      action: "start",
      reply: null,
      optedIn: null,
      fanId: fan.id,
      providerOptIn: false,
      underAge: true,
    };
  }

  await input.directory.setOptIn(fan.id, true);
  return {
    action: "start",
    reply: repliesOn ? SMS_START_REPLY : null,
    optedIn: true,
    fanId: fan.id,
    providerOptIn: true,
    underAge: false,
  };
}

/** Mark every matched fan opted out. Unknown numbers are skipped. */
export async function optOutPhones(
  phones: readonly string[],
  directory: SmsFanDirectory,
): Promise<number> {
  let updated = 0;
  for (const phone of phones) {
    const fan = await directory.findByPhone(phone);
    if (!fan) continue;
    await directory.setOptIn(fan.id, false);
    updated += 1;
  }
  return updated;
}
