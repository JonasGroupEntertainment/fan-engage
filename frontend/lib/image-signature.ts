/**
 * Works out an uploaded image's real type from its first bytes, so a file
 * is judged by what it is, not by the type the browser claims. Port of
 * Brand Engage Pro lib/image-signature.ts.
 *
 * Pure: no "@/" imports, so plain `node --test` can load it.
 */

export type ImageMime = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** The file extension to store for each image type. */
export const IMAGE_EXTENSION: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * A stored file name whose extension matches the image's real type, so the
 * name a browser sent never decides how the file is labelled.
 */
export function imageFileName(safeName: string, type: ImageMime): string {
  const stem = safeName.replace(/\.[^.]*$/, "").replace(/\./g, "-") || "file";
  return `${stem}.${IMAGE_EXTENSION[type]}`;
}

/** How many leading bytes sniffImageType needs. */
export const IMAGE_SIGNATURE_BYTES = 12;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** The image type the bytes really are, or null when they are not one we allow. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "GIF87a" or "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }
  // "RIFF" <size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
