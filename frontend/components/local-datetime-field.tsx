"use client";

import { useRef } from "react";
import { localInputToIso } from "@/lib/dates/datetime-local";

/**
 * A datetime-local field for forms that post straight to a server action
 * (no client submit handler to convert the value).
 *
 * The visible input has no name. A hidden input carries the same moment as
 * an ISO instant, converted in the browser, so the time the person typed is
 * kept in their own zone instead of being stored as UTC. Both inputs are
 * uncontrolled, so a form reset clears them together.
 */
export default function LocalDateTimeField({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const hidden = useRef<HTMLInputElement>(null);
  return (
    <>
      <input type="hidden" name={name} ref={hidden} defaultValue="" />
      <input
        type="datetime-local"
        className={className}
        onChange={(e) => {
          if (hidden.current) hidden.current.value = localInputToIso(e.target.value);
        }}
      />
    </>
  );
}
