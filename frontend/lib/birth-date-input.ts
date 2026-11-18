/**
 * One date-of-birth box that formats itself. The guest types eight digits
 * (03151985) and sees 03/15/1985. Slashes they type themselves are fine:
 * "3/5/1985" reads as March 5.
 */

/** What to show in the box for whatever the guest has typed so far. */
export function formatBirthDateInput(raw: string): string {
  const typed = raw.replace(/[^\d/]/g, "");
  const parts: string[] = [];
  let rest = typed;
  for (const size of [2, 2]) {
    const slash = rest.indexOf("/");
    if (slash >= 0 && slash <= size) {
      // They typed the slash: "3/" means month 3.
      const piece = rest.slice(0, slash);
      parts.push(piece ? piece.padStart(2, "0") : "");
      rest = rest.slice(slash + 1);
      if (!piece) return parts.filter(Boolean).join("/");
      continue;
    }
    const digits = rest.replace(/\//g, "");
    if (!digits) return parts.length ? `${parts.join("/")}/` : "";
    // A first digit above 1 (month) or 3 (day) can only be a single digit.
    const limit = parts.length === 0 ? 1 : 3;
    if (Number(digits[0]) <= limit && digits.length < size) {
      return [...parts, digits].join("/");
    }
    if (Number(digits[0]) > limit) {
      parts.push(`0${digits[0]}`);
      rest = digits.slice(1);
    } else {
      parts.push(digits.slice(0, size));
      rest = digits.slice(size);
    }
  }
  const year = rest.replace(/\//g, "").slice(0, 4);
  return `${parts.join("/")}/${year}`;
}

/**
 * The box's next value after a keystroke. While the guest is deleting we
 * leave what they have alone, so backspace can remove a slash we added.
 */
export function nextBirthDateInput(previous: string, raw: string): string {
  if (raw.length < previous.length) return raw.replace(/[^\d/]/g, "");
  return formatBirthDateInput(raw);
}

/** Month, day and year as typed, or null until all eight digits are in. */
export function splitBirthDateInput(
  value: string,
): { month: string; day: string; year: string } | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatBirthDateInput(value));
  if (!m) return null;
  return { month: m[1], day: m[2], year: m[3] };
}

/** Birthday month (1 to 12) from a stored YYYY-MM-DD date of birth. */
export function birthdayMonthFromBirthDate(birthDate: string | null | undefined): number | null {
  const m = /^\d{4}-(\d{2})-\d{2}/.exec(birthDate ?? "");
  if (!m) return null;
  const month = Number(m[1]);
  return month >= 1 && month <= 12 ? month : null;
}
