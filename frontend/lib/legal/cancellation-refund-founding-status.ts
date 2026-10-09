/**
 * Section 3 of /cancellation-refund described Founding Fan as locked-in
 * subscription pricing. It is a free badge. This rewrite runs at render
 * time so the public page is correct even before the matching SQL
 * migration is applied by hand. Sections 1, 2, 4, and 5 are left as stored.
 *
 * Ship-date placeholder: Monday 12 October 2026, the day before the
 * Tuesday 13 October RaeLynn email. If this merges on another day,
 * change both constants together.
 */
export const CANCELLATION_REFUND_EFFECTIVE_DATE = "2026-10-12T12:00:00.000Z";
export const CANCELLATION_REFUND_UPDATED_AT = "2026-10-12T12:00:00.000Z";

export const FOUNDING_FAN_STATUS_SECTION = `## 3. Founding Fan status

Founding Fan status is a free badge offered to the first 100 fans who join an artist's community. It is not a paid plan and does not change the price of Premium. Founding Fans keep their badge and 1.5× points as long as their account stays active. Premium is a separate optional subscription billed at the rate shown at checkout.`;

const FOUNDING_FAN_PRICING_SECTION = `## 3. Founding Fan pricing

Founding Fan pricing is locked in for the lifetime of your continuous subscription. If you cancel and later re-subscribe, you will be billed at the then-current standard rate; the founder slot is not held for returning fans.`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceFlexible(source: string, from: string, to: string): string {
  const pattern = from
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return source.replace(new RegExp(pattern, "g"), to);
}

export function applyCancellationFoundingStatus(content: string): string {
  if (content.includes("## 3. Founding Fan status")) return content;
  return replaceFlexible(content, FOUNDING_FAN_PRICING_SECTION, FOUNDING_FAN_STATUS_SECTION);
}
