/**
 * The number in a share page address, such as the 3 in /share/rank/<name>/3
 * or /share/founder/<name>/3.
 *
 * These pages are public and their addresses can be typed by anyone, so
 * the number is read strictly: digits only, no leading zero, at most seven
 * digits. `parseInt` is not used because it accepts trailing text
 * ("1 anything here" reads as 1), which let typed words through into page
 * titles and previews. Anything else is null, and the page is not found.
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */
const SHARE_NUMBER = /^[1-9][0-9]{0,6}$/;

export function shareNumber(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !SHARE_NUMBER.test(value)) return null;
  return Number(value);
}
