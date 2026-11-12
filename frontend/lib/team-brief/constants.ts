/** notification_log.notification_type for one team member's Monday brief. */
export const TEAM_BRIEF_KIND = "team_brief";

/** Mandrill message tag for the brief (Mandrill only — see lib/team-brief/send.ts). */
export const TEAM_BRIEF_TAGS = ["team-brief"] as const;

/** Why the brief will not fall back to Mailchimp; surfaced per artist when Mandrill is unset. */
export const TEAM_BRIEF_NO_PROVIDER =
  "team brief needs MANDRILL_API_KEY; Mailchimp would enrol team members in the fan audience";
