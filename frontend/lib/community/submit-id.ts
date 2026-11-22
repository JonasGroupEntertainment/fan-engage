// Makes the one id a post form sends per press of the button.
//
// crypto.randomUUID is missing on Safari before 15.4 and on any page not
// served over https. A form that called it directly would throw there and
// never save the post. This helper never throws: it uses randomUUID when
// the browser has it, otherwise builds the same kind of id from
// getRandomValues, and otherwise returns an empty string. The server
// treats an empty string as no id and saves the post as it always did,
// without the save once guard (see ./save-once.ts).
//
// Pure: no "@/" imports, so plain `node --test` can load it.

/** The parts of the browser's crypto object this helper may use. */
export type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/** Returned when no id can be made. The server saves without the guard. */
export const NO_SUBMIT_ID = "";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_BYTE_COUNT = 16;
const VERSION_BYTE_INDEX = 6;
const VARIANT_BYTE_INDEX = 8;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
/** Where the dashes fall, counted in bytes: 4, 2, 2, 2, 6. */
const GROUP_ENDS = [4, 6, 8, 10, 16];

function fromRandomUuid(source: CryptoLike): string | null {
  try {
    if (typeof source.randomUUID !== "function") return null;
    const id = source.randomUUID();
    return typeof id === "string" && UUID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

function toHex(byte: number): string {
  return byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0");
}

/** Sets the version (4) and variant bits the way RFC 4122 asks. */
function asVersion4(bytes: Uint8Array): number[] {
  return Array.from(bytes, (byte, index) => {
    if (index === VERSION_BYTE_INDEX) return (byte & 0x0f) | 0x40;
    if (index === VARIANT_BYTE_INDEX) return (byte & 0x3f) | 0x80;
    return byte;
  });
}

function fromRandomValues(source: CryptoLike): string | null {
  try {
    if (typeof source.getRandomValues !== "function") return null;
    const bytes = asVersion4(source.getRandomValues(new Uint8Array(UUID_BYTE_COUNT)));
    if (bytes.length !== UUID_BYTE_COUNT) return null;
    return GROUP_ENDS.map((end, group) =>
      bytes.slice(group === 0 ? 0 : GROUP_ENDS[group - 1], end).map(toHex).join(""),
    ).join("-");
  } catch {
    return null;
  }
}

function defaultCrypto(): CryptoLike | undefined {
  try {
    return globalThis.crypto;
  } catch {
    return undefined;
  }
}

/**
 * A fresh v4 id for one press of a post form's button, or an empty string
 * when this browser cannot make one. Never throws.
 */
export function newSubmitId(source: CryptoLike | null | undefined = defaultCrypto()): string {
  if (!source) return NO_SUBMIT_ID;
  return fromRandomUuid(source) ?? fromRandomValues(source) ?? NO_SUBMIT_ID;
}
