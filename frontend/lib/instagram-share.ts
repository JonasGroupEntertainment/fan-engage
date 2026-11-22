/**
 * Sharing to Instagram.
 *
 * Instagram has no "share this link" address, and a link in a normal post
 * cannot be tapped. The way a link works there is a Story with a Link
 * sticker. So the Instagram button does the two things a web page can do,
 * copy the fan's invite link and hand over the share picture, and then
 * tells the fan the two taps left to do inside Instagram.
 *
 * Nothing is sent to Instagram or Meta by us: no script, no app id, no
 * pixel. The fan's own phone opens Instagram.
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */
import { inviteShareUrl, invitePreviewImagePath, shareContextFromUrl } from "./invite-share.ts";

/** Opened in a new tab or, on a phone with the app, in Instagram itself. */
export const INSTAGRAM_URL = "https://www.instagram.com/";

/** Passed to window.open so the new window cannot reach back into our page. */
export const INSTAGRAM_WINDOW_FEATURES = "noopener,noreferrer";

export type InstagramSharePlan = {
  /** The link to copy: the fan's invite link, or the page address. */
  link: string;
  /** Same-site path of the picture to post, or null when the page has none. */
  picturePath: string | null;
  /** File name for the saved picture, or null with no picture. */
  pictureFileName: string | null;
};

/** What the Instagram button copies and which picture it offers. */
export function instagramSharePlan(input: {
  /** Where the invite page lives, such as https://www.fanengagepro.com. */
  origin: string;
  /** The address the share button was given. */
  url: string;
  inviteCode: string | null | undefined;
}): InstagramSharePlan {
  const link = inviteShareUrl(input);
  const context = shareContextFromUrl(input.url);
  const picturePath = invitePreviewImagePath(context);
  if (!picturePath) return { link, picturePath: null, pictureFileName: null };
  return { link, picturePath, pictureFileName: `${context.artist ?? "share"}-picture.png` };
}

/** The numbered steps shown to the fan, in order. */
export function instagramSteps(input: { hasPicture: boolean; linkCopied: boolean }): readonly string[] {
  const copyStep = input.linkCopied
    ? "Your link is copied."
    : "Copy your link with the button below.";
  const storyStep = input.hasPicture
    ? "In Instagram, start a Story with the picture."
    : "In Instagram, start a Story with any photo.";
  const pictureStep = input.hasPicture ? ["Save the picture below."] : [];
  return [copyStep, ...pictureStep, storyStep, "Tap the sticker icon, choose Link, and paste."];
}
