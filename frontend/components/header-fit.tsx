"use client";

import { useEffect } from "react";

/**
 * Keeps the header readable when text is large (a phone's larger-text
 * setting, browser zoom) without changing it at normal size.
 *
 * It measures the header row as it is normally laid out. Only when the site
 * name and the buttons beside it would actually overlap, or the row spills
 * past the screen edge, does it set data-crowded on the row. globals.css then
 * lets the name shrink with an ellipsis ("Fan Engage…"). When everything
 * fits, the attribute is never set and the header is exactly as designed.
 *
 * Each check removes the attribute, measures and re-sets it in one
 * synchronous step, so there is no flicker and the result does not depend on
 * the previous state.
 */
export function HeaderFit() {
  useEffect(() => {
    const row = document.querySelector<HTMLElement>("[data-header-row]");
    const name = row?.querySelector<HTMLElement>("[data-wordmark]");
    if (!row || !name) return;

    let frame = 0;
    const check = () => {
      frame = 0;
      row.removeAttribute("data-crowded");
      if (isCrowded(row, name)) row.setAttribute("data-crowded", "");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };

    // Row height changes when text size changes; width when the window does.
    const ro = new ResizeObserver(schedule);
    ro.observe(row);
    for (const child of Array.from(row.children)) ro.observe(child);
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => {});
    schedule();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

/** Visible box of an element: its border box if it is drawn as a pill or
 *  button, otherwise just its text (so invisible padding does not count). */
function visibleBox(el: HTMLElement): { rect: DOMRect; drawn: boolean } {
  const cs = getComputedStyle(el);
  const drawn =
    cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
    parseFloat(cs.borderTopWidth) > 0;
  if (drawn) return { rect: el.getBoundingClientRect(), drawn };
  const range = document.createRange();
  range.selectNodeContents(el);
  return { rect: range.getBoundingClientRect(), drawn };
}

/** Two buttons' rounded edges may touch by a few pixels at normal size on
 *  some phone widths (360px today). That is not worth changing the design
 *  for. Any overlap that involves text counts. */
const BUTTON_EDGE_TOLERANCE_PX = 6;

function isCrowded(row: HTMLElement, name: HTMLElement): boolean {
  const rowBox = row.getBoundingClientRect();
  const boxes = [visibleBox(name)];
  for (const el of Array.from(row.querySelectorAll<HTMLElement>("a, button"))) {
    if (el.closest("[data-wordmark-link]")) continue;
    const r = el.getBoundingClientRect();
    // Skip hidden items and open menus/panels below the row.
    if (r.width === 0 || r.height === 0) continue;
    if (r.top >= rowBox.bottom || r.bottom <= rowBox.top) continue;
    boxes.push(visibleBox(el));
  }
  boxes.sort((a, b) => a.rect.left - b.rect.left);
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1];
    const next = boxes[i];
    const sameBand =
      prev.rect.top < next.rect.bottom && next.rect.top < prev.rect.bottom;
    const tolerance =
      prev.drawn && next.drawn ? BUTTON_EDGE_TOLERANCE_PX : 0.5;
    if (sameBand && prev.rect.right > next.rect.left + tolerance) return true;
  }
  const last = boxes[boxes.length - 1].rect;
  return last.right > document.documentElement.clientWidth + 0.5;
}
