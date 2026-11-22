"use client";

import { useId, useRef, useState } from "react";
import {
  INSTAGRAM_URL,
  INSTAGRAM_WINDOW_FEATURES,
  instagramSharePlan,
  instagramSteps,
  type InstagramSharePlan,
} from "@/lib/instagram-share";
import { useInviteCode } from "@/components/use-invite-code";

/**
 * "Share to Instagram" button.
 *
 * Instagram has no share-a-link address, so this copies the fan's invite
 * link, offers the share picture to save, and shows the taps left to do in
 * Instagram (a Story with a Link sticker). See lib/instagram-share.ts.
 * No Meta script or pixel is loaded.
 */
export interface InstagramShareButtonProps {
  /** Absolute URL to share. */
  url: string;
  /** Text beside the icon. Leave out for a round icon-only button. */
  label?: string;
  /** Icon-only size: "md" beside a labelled Share pill, "lg" beside a round Share icon. */
  size?: "md" | "lg";
}

const ACCESSIBLE_NAME = "Share to Instagram";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn("InstagramShareButton: could not copy the link", err);
    return false;
  }
}

export default function InstagramShareButton({
  url,
  label,
  size = "md",
}: InstagramShareButtonProps) {
  const inviteCode = useInviteCode();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // One id per button, so two share buttons on a page never share a title id.
  const titleId = useId();
  const [plan, setPlan] = useState<InstagramSharePlan | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleOpen() {
    const nextPlan = instagramSharePlan({ origin: window.location.origin, url, inviteCode });
    setPlan(nextPlan);
    setLinkCopied(false);
    dialogRef.current?.showModal();
    setLinkCopied(await copyText(nextPlan.link));
  }

  async function handleCopyAgain() {
    if (!plan) return;
    setLinkCopied(await copyText(plan.link));
  }

  function handleOpenInstagram() {
    window.open(INSTAGRAM_URL, "_blank", INSTAGRAM_WINDOW_FEATURES);
  }

  function handleClose() {
    dialogRef.current?.close();
  }

  const iconOnly = !label;
  const roundSize = size === "lg" ? "h-[46px] w-[46px]" : "h-10 w-10";
  const baseClass = iconOnly
    ? `inline-flex ${roundSize} shrink-0 items-center justify-center rounded-full text-sm font-medium transition`
    : "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition";
  const styleClass = "border border-white/25 text-white/85 hover:bg-white/10";
  const steps = instagramSteps({ hasPicture: Boolean(plan?.picturePath), linkCopied });

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`${baseClass} ${styleClass}`}
        aria-label={iconOnly ? ACCESSIBLE_NAME : undefined}
        title={iconOnly ? ACCESSIBLE_NAME : undefined}
        aria-haspopup="dialog"
      >
        <InstagramIcon />
        {!iconOnly && <span>{label}</span>}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          // A tap on the dimmed area outside the box closes it.
          if (event.target === event.currentTarget) handleClose();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-white/15 bg-midnight p-0 text-left text-white shadow-glass backdrop:bg-black/70"
      >
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            Share to Instagram
          </h2>
          <p className="mt-1 text-sm text-white/70">
            Instagram only lets a link be tapped from a Story, so it takes a few quick steps.
          </p>

          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className="mt-5 flex flex-col gap-2">
            {plan?.picturePath && plan.pictureFileName && (
              <a
                href={plan.picturePath}
                download={plan.pictureFileName}
                className="rounded-full border border-white/25 px-5 py-2.5 text-center text-sm font-medium text-white/85 hover:bg-white/10"
              >
                Save the picture
              </a>
            )}
            <button
              type="button"
              onClick={handleCopyAgain}
              className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
            >
              <span aria-live="polite">{linkCopied ? "Link copied. Copy again" : "Copy my link"}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenInstagram}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-medium text-white hover:brightness-110"
            >
              Open Instagram
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 text-sm text-white/65 underline hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
