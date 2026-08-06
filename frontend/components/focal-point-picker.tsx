"use client";

/**
 * Click-to-place focal-point picker for hero images.
 *
 * Renders the uploaded photo full-size with a draggable / clickable
 * reticle, plus three live preview tiles showing how the same focal
 * point reads at the three aspect ratios used across the platform
 * (3:4 strip card, 16:9 hero, 1:1 OG card). The picker just owns the
 * (x, y) numbers — the parent form is responsible for posting them
 * with the save action, and the render side picks them up via
 * artists.hero_focal_x / .hero_focal_y after the row reloads.
 */

import { useRef, useState } from "react";

interface Props {
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  onChange: (x: number, y: number) => void;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export default function FocalPointPicker({
  imageUrl,
  focalX,
  focalY,
  onChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);

  if (!imageUrl) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-xs text-white/50">
        Upload a hero image first to set the focal point.
      </div>
    );
  }

  function setFromEvent(e: React.MouseEvent | MouseEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onChange(clamp(x), clamp(y));
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    setDragging(true);
    setFromEvent(e);
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragging) return;
    setFromEvent(e);
  }

  function endDrag() {
    setDragging(false);
  }

  const focalStyle = { objectPosition: `${focalX}% ${focalY}%` };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <p className="mb-2 text-xs text-white/60">
          Click or drag anywhere on the photo to set the focal point. The
          dot marks the spot that stays in view when the image is cropped
          to different aspect ratios on the public pages.
        </p>
        <div
          ref={wrapRef}
          className="relative cursor-crosshair overflow-hidden rounded-2xl bg-black/40 select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            onLoad={() => setImageLoaded(true)}
            draggable={false}
            className="block h-auto max-h-[480px] w-full object-contain"
          />
          {imageLoaded && (
            <span
              aria-hidden
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-100"
              style={{ left: `${focalX}%`, top: `${focalY}%` }}
            >
              <span className="block h-6 w-6 rounded-full border-2 border-white bg-aurora/70 shadow-[0_0_0_2px_rgba(0,0,0,0.55)]" />
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/50">x %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={focalX}
              onChange={(e) =>
                onChange(clamp(parseFloat(e.target.value) || 0), focalY)
              }
              className="mt-1 w-20 rounded-2xl border border-white/10 bg-black/40 px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/50">y %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={focalY}
              onChange={(e) =>
                onChange(focalX, clamp(parseFloat(e.target.value) || 0))
              }
              className="mt-1 w-20 rounded-2xl border border-white/10 bg-black/40 px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(50, 50)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            Reset to center
          </button>
          <p className="ml-auto text-xs text-white/50">
            Saves with the rest of the form.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/60">
          Live preview · {focalX}% {focalY}%
        </p>
        <div className="grid grid-cols-3 gap-2">
          <PreviewTile imageUrl={imageUrl} aspect="aspect-[3/4]" label="Strip · 3:4" focalStyle={focalStyle} />
          <PreviewTile imageUrl={imageUrl} aspect="aspect-[16/9]" label="Hero · 16:9" focalStyle={focalStyle} />
          <PreviewTile imageUrl={imageUrl} aspect="aspect-square" label="OG · 1:1" focalStyle={focalStyle} />
        </div>
      </div>
    </div>
  );
}

function PreviewTile({
  imageUrl,
  aspect,
  label,
  focalStyle,
}: {
  imageUrl: string;
  aspect: string;
  label: string;
  focalStyle: { objectPosition: string };
}) {
  return (
    <div className="space-y-1">
      <div className={`relative ${aspect} overflow-hidden rounded-xl border border-white/10 bg-black/40`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          style={focalStyle}
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
      </div>
      <p className="text-center text-xs uppercase tracking-wide text-white/50">
        {label}
      </p>
    </div>
  );
}
