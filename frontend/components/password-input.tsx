"use client";

import { useId, useState, type ComponentProps } from "react";

/** Keeps password-manager semantics and makes visibility a deliberate action. */
export function PasswordInput({
  id,
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input {...props} id={inputId} type={visible ? "text" : "password"}
        className={`${className} pr-20`} />
      <button type="button" aria-controls={inputId} aria-pressed={visible}
        aria-label="Show password"
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-1 my-1 min-w-16 rounded-xl px-3 text-xs font-medium text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        {visible ? "Hide" : "Show"}
      </button>
    </span>
  );
}
