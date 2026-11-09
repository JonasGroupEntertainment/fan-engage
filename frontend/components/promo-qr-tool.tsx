"use client";

import { useEffect, useId, useState } from "react";
import type { PromoDestination } from "@/lib/promo-qr/destinations";
import { renderPromoQrPngDataUrl, renderPromoQrSvg } from "@/lib/promo-qr/render";
import { preparePromoQr } from "@/lib/promo-qr/url";

/**
 * Static promo-link QR. The optional name is the download filename only.
 * The code encodes `url` and nothing else. No error-correction or margin
 * controls — those stay at the print defaults in lib/promo-qr/render.ts.
 */
export default function PromoQrTool({
  artistName,
  destinations,
}: {
  artistName: string;
  destinations: PromoDestination[];
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<"png" | "svg" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const nameHelpId = useId();
  const urlHelpId = useId();
  const urlErrorId = useId();

  const prepared = preparePromoQr({ url, name });
  const showError = !prepared.ok && (touched || url.trim() !== "");
  const example = destinations[0]?.url ?? "";
  const who = artistName.trim();

  async function downloadPng() {
    const current = preparePromoQr({ url, name });
    setTouched(true);
    if (!current.ok) return;
    setBusy("png");
    setDownloadError(null);
    try {
      const dataUrl = await renderPromoQrPngDataUrl(current.url);
      saveFile(dataUrl, current.pngFilename);
    } catch {
      setDownloadError("Could not create the PNG. Check the link and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadSvg() {
    const current = preparePromoQr({ url, name });
    setTouched(true);
    if (!current.ok) return;
    setBusy("svg");
    setDownloadError(null);
    try {
      const svg = await renderPromoQrSvg(current.url);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const objectUrl = URL.createObjectURL(blob);
      saveFile(objectUrl, current.svgFilename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch {
      setDownloadError("Could not create the SVG. Check the link and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-3">
        <h1
          className="text-2xl font-semibold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Promo QR
        </h1>
        <p className="text-sm text-white/70">
          Make a QR code that opens a link. People scan it and go to that page.
          This is for a promotion, sign-up, event, or any other page — not
          check-in. Scanning it does not mark attendance or award points.
        </p>
        <p className="text-sm text-white/70">
          The code does not expire. If the page is later changed or taken down,
          a printed code still opens the same address, and that page might no
          longer be available.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,20rem)]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void downloadPng();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="promo-name" className="block text-sm font-medium text-white">
              What are you promoting?{" "}
              <span className="font-normal text-white/45">Optional</span>
            </label>
            <input
              id="promo-name"
              name="promo-name"
              type="text"
              autoComplete="off"
              maxLength={80}
              value={name}
              placeholder="Summer meetup flyer"
              aria-describedby={nameHelpId}
              onChange={(event) => {
                setName(event.target.value);
                setDownloadError(null);
              }}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora"
            />
            <p id={nameHelpId} className="text-xs text-white/55">
              Optional. This name is only for the file you download. It is not
              part of the link, and naming a promotion does not create a page.
            </p>
          </div>

          {destinations.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-white">Choose a page</legend>
              <p className="text-xs text-white/55">
                {who
                  ? `Pages for ${who}. Pick one to fill the link, or paste a different address below.`
                  : "Pick a page to fill the link, or paste a different address below."}
              </p>
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                {destinations.map((destination) => {
                  const inputId = `promo-dest-${destination.id}`;
                  const selected = url === destination.url;
                  return (
                    <label
                      key={destination.id}
                      htmlFor={inputId}
                      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${
                        selected
                          ? "border-aurora/50 bg-aurora/10"
                          : "border-white/10 bg-black/20 hover:border-white/25"
                      }`}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name="promo-destination"
                        value={destination.url}
                        checked={selected}
                        onChange={() => {
                          setUrl(destination.url);
                          setTouched(true);
                          setDownloadError(null);
                        }}
                        className="mt-1 h-4 w-4 accent-aurora"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white">
                          {destination.label}
                        </span>
                        <span className="block text-xs text-white/55">{destination.hint}</span>
                        <span className="mt-1 block break-all font-mono text-[11px] text-white/40">
                          {destination.url}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="space-y-2">
            <label htmlFor="promo-url" className="block text-sm font-medium text-white">
              Where should the code take people?
            </label>
            <input
              id="promo-url"
              name="promo-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              placeholder={example || "https://example.com/your-page"}
              aria-invalid={showError}
              aria-describedby={showError ? `${urlHelpId} ${urlErrorId}` : urlHelpId}
              onBlur={() => setTouched(true)}
              onChange={(event) => {
                setUrl(event.target.value);
                setDownloadError(null);
              }}
              className="min-h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aurora"
            />
            <p id={urlHelpId} className="text-xs text-white/55">
              {example
                ? `Paste a full link, or pick a page above. For example, ${example}`
                : "Paste a full link starting with https://. For example, https://example.com/your-page"}
            </p>
            {showError && (
              <p id={urlErrorId} role="alert" className="text-sm text-ember">
                {prepared.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="submit"
              disabled={!prepared.ok || busy !== null}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-midnight hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 sm:w-auto"
            >
              {busy === "png" ? "Preparing PNG…" : "Download QR code"}
            </button>
            <button
              type="button"
              disabled={!prepared.ok || busy !== null}
              onClick={() => void downloadSvg()}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30 sm:w-auto"
            >
              {busy === "svg" ? "Preparing SVG…" : "Download SVG"}
            </button>
          </div>
          <p className="text-xs text-white/50">
            The PNG is a large print file with a white border so phones can scan
            it. SVG is included if a designer needs the same code.
          </p>
          {downloadError && (
            <p role="alert" className="text-sm text-ember">
              {downloadError}
            </p>
          )}
        </form>

        <aside className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white">Live preview</h2>
          {prepared.ok ? (
            <div className="mt-4 space-y-3">
              <PromoQrPreview key={prepared.url} url={prepared.url} />
              <p className="text-xs text-white/55">Scanning opens this link</p>
              <p className="break-all font-mono text-xs text-white/80">{prepared.url}</p>
            </div>
          ) : (
            <div className="mt-4 flex aspect-square items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 text-center">
              <p className="text-sm text-white/50">
                The code shows up here once the link looks right.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PromoQrPreview({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderPromoQrSvg(url)
      .then((markup) => {
        if (!cancelled) setSvg(scaleSvg(markup));
      })
      .catch(() => {
        if (!cancelled) setError("Could not draw a preview for this link.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-ember">
        {error}
      </p>
    );
  }
  if (!svg) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-white/80 text-sm text-midnight/70">
        Drawing the code…
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`QR code. Scanning opens ${url}`}
      className="mx-auto aspect-square w-full max-w-64 rounded-2xl bg-white p-3 [&_svg]:h-full [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function scaleSvg(svg: string): string {
  return svg
    .replace("<svg ", '<svg aria-hidden="true" focusable="false" ')
    .replace(/\swidth="\d+"/, ' width="100%"')
    .replace(/\sheight="\d+"/, ' height="100%"');
}

function saveFile(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
