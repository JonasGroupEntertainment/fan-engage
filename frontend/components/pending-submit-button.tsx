"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface Props {
  children: ReactNode;
  pendingLabel: ReactNode;
  className?: string;
}

/**
 * Submit button for server-action forms. Disables itself while the form is
 * submitting so a double click or double tap can't send the form twice.
 */
export default function PendingSubmitButton({ children, pendingLabel, className }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
