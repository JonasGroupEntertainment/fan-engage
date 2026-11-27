/**
 * Taking the check-in code out of the address once it has been used, so a
 * reopened tab, a bookmark or a history entry cannot repeat the check-in.
 * Pure: no "@/" imports.
 */

/** Answers after which the code in the address has no further use. */
const FINAL_ANSWERS: readonly string[] = ["success", "already", "token_expired"];

export function isFinalCheckinAnswer(state: string): boolean {
  return FINAL_ANSWERS.includes(state);
}

/**
 * The same address without the code, as a path with any other query and
 * fragment kept. Null when there is no code to remove or the address
 * cannot be read.
 */
export function addressWithoutCheckinCode(href: string, param: string): string | null {
  try {
    const url = new URL(href);
    if (!url.searchParams.has(param)) return null;
    url.searchParams.delete(param);
    const query = url.searchParams.toString();
    return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  } catch {
    return null;
  }
}
