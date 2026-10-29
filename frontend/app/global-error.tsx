"use client";

import { useEffect } from "react";

// Replaces the root layout when it fails, so it must render <html>/<body>
// itself. Global styles don't load here; colours are inlined to match the
// midnight/aurora/ember palette in globals.css.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Fan Engage</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#050b1f",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 640,
            margin: "0 auto",
            padding: "80px 24px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              opacity: 0.7,
              margin: "0 0 24px",
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              fontFamily: '"Space Grotesk", Inter, system-ui, sans-serif',
              fontSize: 36,
              fontWeight: 600,
              lineHeight: 1.2,
              margin: "0 0 24px",
            }}
          >
            Fan Engage hit a snag.
          </h1>
          <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 32px" }}>
            It&apos;s usually temporary. Try again in a moment.
            {error.digest ? (
              <span
                style={{
                  display: "block",
                  marginTop: 8,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  opacity: 0.7,
                }}
              >
                Reference: {error.digest}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              border: 0,
              borderRadius: 9999,
              backgroundImage: "linear-gradient(90deg, #7c3aed, #fb923c)",
              color: "#ffffff",
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
