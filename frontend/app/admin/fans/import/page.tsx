"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { importFansAction, type ImportRow, type ImportResult } from "./actions";

const EXPECTED_COLUMNS = ["email", "first_name", "phone", "instagram", "tiktok", "city"];

function parseCSV(text: string): { rows: ImportRow[]; parseError: string | null } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], parseError: "CSV must have a header row and at least one data row." };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  if (!headers.includes("email")) {
    return { rows: [], parseError: 'CSV must include an "email" column.' };
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });
    rows.push({
      email: obj.email ?? "",
      first_name: obj.first_name || obj.firstname || obj.name || undefined,
      phone: obj.phone || obj.phone_number || undefined,
      instagram: obj.instagram || undefined,
      tiktok: obj.tiktok || undefined,
      city: obj.city || undefined,
    });
  }
  return { rows, parseError: null };
}

const COMMUNITIES = [
  { slug: "raelynn", label: "RaeLynn" },
  { slug: "danger-twins", label: "Danger Twins · Amy Stroup" },
  { slug: "hunter-hawkins", label: "Hunter Hawkins" },
  { slug: "teamjonasgroup", label: "Team Jonas Group" },
  { slug: "nellies", label: "Nellies" },
];

export default function FanImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [communityId, setCommunityId] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
    setParseError(null);
    setResult(null);
    setStatus("idle");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, parseError: err } = parseCSV(text);
      if (err) {
        setParseError(err);
        setPreview([]);
      } else {
        setPreview(rows);
      }
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!preview.length) return;
    setStatus("importing");
    try {
      const CHUNK = 25;
      const totals = { created: 0, updated: 0, skipped: 0, errors: [] as { row: number; email: string; reason: string }[] };
      for (let i = 0; i < preview.length; i += CHUNK) {
        const chunk = preview.slice(i, i + CHUNK).map((r, j) => ({ ...r, _rowIndex: i + j + 2 }));
        const res = await fetch("/api/admin/import-fans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk, communityId: communityId || undefined }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        totals.created += data.created;
        totals.updated += data.updated;
        totals.skipped += data.skipped;
        totals.errors.push(...(data.errors ?? []));
      }
      setResult({ total: preview.length, ...totals });
      setStatus("done");
    } catch (e) {
      setStatus("error");
      console.error(e);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header>
        <Link href="/admin/fans" className="text-xs uppercase tracking-widest text-white/50 hover:text-white">
          ← Fans
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-white">Import fans from CSV</h1>
        <p className="mt-1 text-sm text-white/60">
          Upload a CSV with fan email addresses. Existing fans are updated (never duplicated);
          new rows are created. Social handles strip leading @.
        </p>
      </header>

      {/* Column guide */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
        <p className="font-semibold uppercase tracking-wide text-white/50 mb-2">Accepted columns</p>
        <div className="flex flex-wrap gap-2">
          {EXPECTED_COLUMNS.map((c) => (
            <span key={c} className={`rounded-full px-2 py-0.5 font-mono ${c === "email" ? "bg-aurora/20 text-aurora" : "bg-white/10"}`}>
              {c}{c === "email" ? " *" : ""}
            </span>
          ))}
        </div>
        <p className="mt-3 text-white/50">* required — all others optional</p>
      </div>

      {/* Community selector */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-white/50">Artist Community</p>
        <select
          value={communityId}
          onChange={(e) => setCommunityId(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:border-white/40 focus:outline-none"
        >
          <option value="">— No community assignment —</option>
          {COMMUNITIES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
        </select>
        <p className="text-xs text-white/50">Fans will be segmented to this artist community. No emails will be sent.</p>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a CSV file to upload, or drag and drop one here"
        className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 p-10 text-center transition hover:border-white/40 cursor-pointer focus:outline-none focus:border-white/60"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p className="text-3xl">📂</p>
        <p className="mt-2 text-sm font-semibold text-white">
          {file ? file.name : "Drop CSV here or click to browse"}
        </p>
        {file && <p className="mt-1 text-xs text-white/50">{preview.length} rows parsed</p>}
      </div>

      {parseError && (
        <p className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">
          {parseError}
        </p>
      )}

      {/* Preview table */}
      {preview.length > 0 && status !== "done" && (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-widest text-white/50">
            Preview — first 5 rows of {preview.length}
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  {["email", "first_name", "phone", "instagram", "tiktok", "city"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-white/5 text-white/80">
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{row.first_name ?? "—"}</td>
                    <td className="px-3 py-2">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2">{row.instagram ?? "—"}</td>
                    <td className="px-3 py-2">{row.tiktok ?? "—"}</td>
                    <td className="px-3 py-2">{row.city ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={status === "importing"}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {status === "importing" ? `Importing ${preview.length} fans…` : `Import ${preview.length} fans`}
          </button>
        </div>
      )}

      {/* Result */}
      {result && status === "done" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Created", value: result.created, color: "text-emerald-400" },
              { label: "Updated", value: result.updated, color: "text-aurora" },
              { label: "Skipped", value: result.skipped, color: "text-white/50" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-white/50">{label}</p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-400 mb-2">
                {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
              </p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-rose-300">
                    Row {e.row} ({e.email}): {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href="/admin/fans"
              className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 hover:bg-white/10"
            >
              View fans →
            </Link>
            <button
              onClick={() => {
                setFile(null);
                setPreview([]);
                setResult(null);
                setStatus("idle");
              }}
              className="text-sm text-white/50 hover:text-white"
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <p className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">
          Import failed — check console for details and try again.
        </p>
      )}
    </div>
  );
}
