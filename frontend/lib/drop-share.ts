/**
 * The public drop share page: /share/drop/<artist>/<drop>.
 *
 * The last part of that address is free text. The page used to turn it
 * into a heading ("Exclusive Drop: <those words>"), a page title, a social
 * preview and a share message, so anyone could type an address and make
 * the site appear to announce anything in an artist's name, including
 * things guest copy must never promise (lib/launch-catalog.ts
 * GUEST_FORBIDDEN_PHRASES) or the name of a reward that is not public.
 *
 * Nothing on the page, in its title, in its picture or in its share
 * message is taken from the address any more. The wording is fixed and
 * names only the artist. The address still has to look like a drop link,
 * so old links keep working and junk gets "page not found".
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */

/** Same shape as a share item in lib/invite-share.ts. */
const DROP_ITEM = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether the last part of the address looks like a drop link at all. */
export function isDropShareItem(value: string | null | undefined): value is string {
  return typeof value === "string" && DROP_ITEM.test(value);
}

/** Heading shown where the typed words used to be. */
export const DROP_SHARE_HEADLINE = "A new drop";

export type DropShareCopy = {
  /** Page and social preview title. */
  title: string;
  /** Page and social preview description. */
  description: string;
  /** Heading on the page and in the picture. */
  headline: string;
  /** Title of the share a visitor sends from the page. */
  shareTitle: string;
};

/** Every word the drop share page shows. Takes the artist's name and nothing else. */
export function dropShareCopy(artistName: string): DropShareCopy {
  return {
    title: `Exclusive Drop — ${artistName}`,
    description: `Premium fans got first access to a new drop from ${artistName} on Fan Engage.`,
    headline: DROP_SHARE_HEADLINE,
    shareTitle: `I got early access to a new drop from ${artistName}`,
  };
}
