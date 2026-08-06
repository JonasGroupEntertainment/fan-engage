"use client";

/**
 * Reusable search input. Two behaviors:
 *
 *   1. Submit-to-/search — Enter without using the dropdown navigates
 *      to /search?q=<value>. Same behavior as before this typeahead
 *      lived in the file.
 *   2. Typeahead dropdown — debounced fetch of /api/search after the
 *      user has typed at least 2 characters. Shows the top 5 results
 *      with category labels (Community, Post, Event, etc.). Click or
 *      keyboard-Enter on a result navigates straight to it. Keyboard
 *      nav: Up/Down moves the highlighted row, Enter activates,
 *      Escape closes the dropdown.
 *
 * Used on:
 *   - The /search results page (with defaultValue=current query)
 *   - The global header (no defaultValue)
 *
 * The typeahead fetch is rate-limited by a 300ms debounce and skipped
 * for values < 2 chars. /api/search is no-store so we never serve
 * stale moderation/visibility filters.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  defaultValue?: string;
  /** Compact variant for the global header. */
  compact?: boolean;
  placeholder?: string;
}

type TypeaheadResult = {
  key: string;
  label: string;
  sublabel: string | null;
  category: "Community" | "Post" | "Event" | "Reward" | "Comment";
  href: string;
  distance: number;
};

const MIN_QUERY_CHARS = 2;
const DEBOUNCE_MS = 300;
const MAX_RESULTS = 5;

const CATEGORY_COLOR: Record<TypeaheadResult["category"], string> = {
  Community: "text-fuchsia-300 border-fuchsia-300/30",
  Post: "text-emerald-300 border-emerald-300/30",
  Event: "text-amber-300 border-amber-300/30",
  Reward: "text-sky-300 border-sky-300/30",
  Comment: "text-white/60 border-white/20",
};

function flattenSearchResults(json: unknown): TypeaheadResult[] {
  // Defensive parse — the API can also return error objects.
  if (!json || typeof json !== "object" || !("groups" in json)) return [];
  const groups = (json as { groups?: Record<string, unknown[]> }).groups ?? {};
  const flat: TypeaheadResult[] = [];

  for (const hit of (groups.communities ?? []) as Array<{ data: { kind: "community"; slug: string; display_name: string; tagline: string | null }; distance: number }>) {
    flat.push({
      key: `community:${hit.data.slug}`,
      label: hit.data.display_name,
      sublabel: hit.data.tagline,
      category: "Community",
      href: `/artists/${hit.data.slug}`,
      distance: hit.distance,
    });
  }
  for (const hit of (groups.posts ?? []) as Array<{ data: { kind: "post"; id: string; artist_slug: string; title: string | null; body: string }; distance: number }>) {
    const fallback = hit.data.body.length > 60 ? hit.data.body.slice(0, 57) + "…" : hit.data.body;
    flat.push({
      key: `post:${hit.data.id}`,
      label: hit.data.title ?? fallback,
      sublabel: hit.data.title ? fallback : null,
      category: "Post",
      href: `/artists/${hit.data.artist_slug}/community`,
      distance: hit.distance,
    });
  }
  for (const hit of (groups.events ?? []) as Array<{ data: { kind: "event"; id: string; artist_slug: string; title: string; detail: string | null; event_date: string | null }; distance: number }>) {
    flat.push({
      key: `event:${hit.data.id}`,
      label: hit.data.title,
      sublabel: hit.data.event_date ?? hit.data.detail,
      category: "Event",
      href: `/artists/${hit.data.artist_slug}`,
      distance: hit.distance,
    });
  }
  for (const hit of (groups.rewards ?? []) as Array<{ data: { kind: "reward"; id: string; community_id: string; title: string; description: string | null; point_cost: number }; distance: number }>) {
    flat.push({
      key: `reward:${hit.data.id}`,
      label: hit.data.title,
      sublabel: hit.data.point_cost ? `${hit.data.point_cost.toLocaleString()} pts` : hit.data.description,
      category: "Reward",
      href: `/rewards`,
      distance: hit.distance,
    });
  }
  for (const hit of (groups.comments ?? []) as Array<{ data: { kind: "comment"; id: string; post_id: string; body: string; artist_slug: string }; distance: number }>) {
    const snippet = hit.data.body.length > 80 ? hit.data.body.slice(0, 77) + "…" : hit.data.body;
    flat.push({
      key: `comment:${hit.data.id}`,
      label: snippet,
      sublabel: null,
      category: "Comment",
      href: `/artists/${hit.data.artist_slug}/community`,
      distance: hit.distance,
    });
  }

  flat.sort((a, b) => a.distance - b.distance);
  return flat.slice(0, MAX_RESULTS);
}

export default function SearchInput({
  defaultValue = "",
  compact = false,
  placeholder = "Search posts, communities, events…",
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [results, setResults] = useState<TypeaheadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Init to defaultValue so the /search page (where defaultValue=q) doesn't
  // double-fetch on hydration — the page itself already rendered the same
  // results server-side.
  const lastFetchedQuery = useRef<string>(defaultValue.trim());
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch on value change. Skips when below MIN_QUERY_CHARS or
  // when the value matches the most-recently-fetched query.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_CHARS) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (trimmed === lastFetchedQuery.current) return;

    const handle = setTimeout(async () => {
      // Cancel any in-flight request before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const json = await res.json();
        lastFetchedQuery.current = trimmed;
        setResults(flattenSearchResults(json));
        setSelectedIndex(-1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function navigateToResult(r: TypeaheadResult) {
    setOpen(false);
    setValue("");
    setResults([]);
    setSelectedIndex(-1);
    router.push(r.href);
  }

  function submitFullSearch(query: string) {
    setOpen(false);
    setSelectedIndex(-1);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      navigateToResult(results[selectedIndex]);
      return;
    }
    submitFullSearch(trimmed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedIndex(-1);
    }
  }

  const trimmed = value.trim();
  const showDropdown =
    open && trimmed.length >= MIN_QUERY_CHARS && (loading || results.length > 0 || trimmed.length >= MIN_QUERY_CHARS);

  const sizing = compact ? "h-9 text-xs" : "h-11 text-sm";
  const dropdownTop = compact ? "top-10" : "top-12";

  // Memoize the dropdown content so non-result-related rerenders don't
  // remount the result list.
  const dropdown = useMemo(() => {
    if (!showDropdown) return null;
    return (
      <div
        className={`absolute left-0 right-0 ${dropdownTop} z-50 overflow-hidden rounded-2xl border border-white/15 bg-black/85 backdrop-blur shadow-2xl`}
        role="listbox"
      >
        {loading && results.length === 0 && (
          <div className="px-4 py-3 text-xs text-white/50">Searching…</div>
        )}
        {!loading && results.length === 0 && trimmed.length >= MIN_QUERY_CHARS && (
          <div className="px-4 py-3 text-xs text-white/50">
            No matches. Press Enter to search the full index.
          </div>
        )}
        {results.map((r, idx) => {
          const active = idx === selectedIndex;
          return (
            <button
              key={r.key}
              type="button"
              role="option"
              aria-selected={active}
              onMouseDown={(e) => {
                // Mousedown so we beat the input's blur/click-outside.
                e.preventDefault();
                navigateToResult(r);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={
                "flex w-full items-start gap-3 px-4 py-2.5 text-left transition " +
                (active ? "bg-white/10" : "hover:bg-white/5")
              }
            >
              <span
                className={
                  "mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs tracking-widest " +
                  CATEGORY_COLOR[r.category]
                }
              >
                {r.category.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{r.label}</span>
                {r.sublabel && (
                  <span className="block truncate text-xs text-white/55">{r.sublabel}</span>
                )}
              </span>
            </button>
          );
        })}
        {results.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              submitFullSearch(trimmed);
            }}
            className="block w-full border-t border-white/10 bg-black/40 px-4 py-2 text-left text-xs text-white/70 hover:bg-white/10"
          >
            Press Enter to see all results for &ldquo;{trimmed}&rdquo; &rarr;
          </button>
        )}
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown, loading, results, selectedIndex, trimmed, dropdownTop]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={onSubmit} role="search" className="w-full">
        <label className="sr-only" htmlFor="global-search">
          Search
        </label>
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
          >
            ⌕
          </span>
          <input
            ref={inputRef}
            id="global-search"
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (value.trim().length >= MIN_QUERY_CHARS) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls="global-search-typeahead"
            className={`w-full rounded-full border border-white/10 bg-black/40 pl-9 pr-3 text-white placeholder-white/40 outline-none transition focus:border-white/30 focus:bg-black/60 ${sizing}`}
          />
        </div>
      </form>
      {dropdown}
    </div>
  );
}
