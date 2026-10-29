"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewTourListAction,
  bulkCreateEventsAction,
  type TourListPreview,
  type BulkCreateResult,
} from "./actions";

const PLACEHOLDER = [
  "One show per line, e.g.",
  "Mar 14, 2026 — Ryman Auditorium — Nashville, TN — https://tix.example",
  "3/14/26 | The Fillmore | Detroit, MI | 7:30 PM",
  "March 14 2026 Red Rocks Amphitheatre, Morrison CO",
].join("\n");

/**
 * "Paste a tour list" panel on the artist-portal Events page.
 * Textarea → Preview (server-parsed rows with resolved coordinates,
 * unparsed lines, rows that already exist) → "Create N events".
 */
export default function BulkAddPanel({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<TourListPreview | null>(null);
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runPreview() {
    setErr(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await previewTourListAction(text);
        if ("error" in r) {
          setErr(r.error);
          setPreview(null);
        } else {
          setPreview(r);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Preview failed.");
      }
    });
  }

  function runCreate() {
    setErr(null);
    startTransition(async () => {
      try {
        const r = await bulkCreateEventsAction(text);
        if ("error" in r) {
          setErr(r.error);
          return;
        }
        setResult(r);
        setPreview(null);
        setText("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Create failed.");
      }
    });
  }

  const existing = new Set(preview?.existing ?? []);
  const creatable = preview ? preview.rows.filter((r) => !existing.has(r.line)).length : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white/70">Paste a tour list</p>
          <p className="mt-1 text-xs text-white/40">
            One show per line: date, venue, city/state, optional time and ticket
            link, in any order. Dashes, pipes, commas or tabs between them.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-white/50 hover:text-white"
        >
          Close
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
          setResult(null);
        }}
        rows={8}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runPreview}
          disabled={pending || !text.trim()}
          className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          {pending && !preview ? "Parsing…" : "Preview"}
        </button>
        {preview && creatable > 0 && (
          <button
            type="button"
            onClick={runCreate}
            disabled={pending}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Creating…" : `Create ${creatable} event${creatable === 1 ? "" : "s"}`}
          </button>
        )}
        {err && <span className="text-xs text-rose-300">✗ {err}</span>}
        {result && (
          <span className="text-xs text-emerald-300">
            ✓ Created {result.created}
            {result.skipped > 0 ? ` · skipped ${result.skipped} already on the calendar` : ""}
            {result.unparsed > 0 ? ` · ${result.unparsed} line${result.unparsed === 1 ? "" : "s"} not understood` : ""}
          </span>
        )}
      </div>

      {preview && (
        <div className="mt-4 space-y-3">
          {preview.rows.length === 0 && preview.errors.length === 0 && (
            <p className="text-xs text-white/50">Nothing to import — the paste was empty.</p>
          )}

          {preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-white/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Venue</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Map</th>
                    <th className="px-3 py-2 font-medium">Link</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const skip = existing.has(r.line);
                    return (
                      <tr
                        key={r.line}
                        className={`border-t border-white/5 ${skip ? "text-white/35" : "text-white/80"}`}
                      >
                        <td className="px-3 py-2 tabular-nums text-white/40">{r.line}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.time ?? "—"}</td>
                        <td className="px-3 py-2">
                          {r.venue}
                          {r.detail && <span className="block text-white/40">{r.detail}</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.location ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {typeof r.lat === "number" && typeof r.lng === "number" ? (
                            <span className="text-emerald-300">
                              {r.lat.toFixed(2)}, {r.lng.toFixed(2)}
                            </span>
                          ) : r.location ? (
                            <span className="text-amber-300">unresolved</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-2">
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-purple-300 hover:underline">
                              {r.url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {skip ? (
                            <span className="rounded-full bg-white/10 px-2 py-0.5">already exists · skip</span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">new</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-300">
                {preview.errors.length} line{preview.errors.length === 1 ? "" : "s"} will be skipped
              </p>
              <ul className="mt-1 space-y-1 text-xs text-white/60">
                {preview.errors.map((e) => (
                  <li key={e.line} className="flex gap-2">
                    <span className="tabular-nums text-white/40">{e.line}</span>
                    <span className="truncate font-mono text-white/50">{e.raw}</span>
                    <span className="shrink-0 text-amber-300/80">{e.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-white/40">
            Unresolved locations are saved without coordinates (no &ldquo;near me&rdquo;
            distance); you can add them later from Edit. Events are created visible
            to fans.
          </p>
        </div>
      )}
    </div>
  );
}
