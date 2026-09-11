/** Validate before navigation. Backslashes and control bytes can normalize to external hosts. */
export function safeAppPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const base = "https://fan-engage.invalid";
    if (new URL(raw, base).origin !== base) return null;
    return raw;
  } catch {
    return null;
  }
}
