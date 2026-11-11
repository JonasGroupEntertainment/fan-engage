"use client";

import { useCallback, useRef } from "react";
import { isoToLocalInput } from "./datetime-local";

/**
 * Ref callback that pre-fills a datetime-local input with a stored instant,
 * shown in the viewer's own zone.
 *
 * It fills the field once, in the browser, instead of passing
 * `defaultValue`. The server renders in UTC and cannot know the viewer's
 * zone, so a `defaultValue` would be the UTC clock time and React would
 * keep it after hydration.
 */
export function useLocalDateTimeDefault(iso: string | null | undefined) {
  const filled = useRef(false);
  return useCallback(
    (input: HTMLInputElement | null) => {
      if (!input || filled.current) return;
      filled.current = true;
      input.value = isoToLocalInput(iso);
    },
    [iso],
  );
}
