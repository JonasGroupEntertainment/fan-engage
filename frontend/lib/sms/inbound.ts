import { AGE_ADULT_ONLY_MESSAGE } from "../age-gate.ts";
import {
  SMS_START_REPLY,
  SMS_STOP_REPLY,
  classifySmsKeyword,
  smsHelpReply,
  type SmsKeyword,
} from "./keywords.ts";
import type { SmsProviderName } from "./deliver.ts";
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
  /** Text the provider should send back. Null when Mailchimp already replies, or there is nothing to say. */
  reply: string | null;
  /** Local opt-in after this message, when a fan row changed. */
  optedIn: boolean | null;
  fanId: string | null;
};

/**
 * Apply one inbound keyword. Twilio still gets the same STOP / HELP /
 * START replies it sent via TwiML. Mailchimp Marketing auto-replies to
 * STOP (and HELP) on a 10DLC, so STOP does not get a second text from
 * us. HELP and START replies are returned for Mailchimp unless the
 * caller turns them off after a test shows Mailchimp already sent them.
 * A known under-18 fan is never opted back in.
 */
export async function handleInboundSms(input: {
  from: string;
  text: string;
  provider: SmsProviderName;
  directory: SmsFanDirectory;
  supportEmail: string;
  now?: Date;
  sendKeywordReplies?: boolean;
}): Promise<InboundOutcome> {
  const action = classifySmsKeyword(input.text);
  if (action === "other") {
    return { action, reply: null, optedIn: null, fanId: null };
  }
  const fan = await input.directory.findByPhone(input.from);
  const repliesOn = input.sendKeywordReplies !== false;

  if (action === "stop") {
    if (fan) await input.directory.setOptIn(fan.id, false);
    return {
      action,
      reply: input.provider === "twilio" ? SMS_STOP_REPLY : null,
      optedIn: fan ? false : null,
      fanId: fan?.id ?? null,
    };
  }

  if (action === "help") {
    const reply =
      input.provider === "twilio" || repliesOn ? smsHelpReply(input.supportEmail) : null;
    return { action, reply, optedIn: null, fanId: fan?.id ?? null };
  }

  if (fan && !smsAgeAllowsSend(fan.birthDate, input.now)) {
    return {
      action: "start",
      reply: AGE_ADULT_ONLY_MESSAGE,
      optedIn: null,
      fanId: fan.id,
    };
  }
  if (fan) await input.directory.setOptIn(fan.id, true);
  const reply = input.provider === "mailchimp" && !repliesOn ? null : SMS_START_REPLY;
  return {
    action: "start",
    reply,
    optedIn: fan ? true : null,
    fanId: fan?.id ?? null,
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
