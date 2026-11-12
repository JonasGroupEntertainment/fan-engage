import Link from "next/link";
import type { TodayItem, TodayItemKind } from "@/lib/today/select";

const ICON: Record<TodayItemKind, string> = {
  checkin: "📍",
  event: "🎤",
  posts: "💬",
  streak: "🔥",
  reward: "🎁",
};

/**
 * "Today" — one compact row of up to four chips at the top of Fan Home
 * answering "what can I do right now". Items arrive already prioritised
 * from `selectTodayItems`; the first one carries the accent gradient, the
 * rest are quiet glass chips. Renders nothing at all when there is nothing
 * to do — no empty card, no heading.
 */
export default function TodayRow({ items }: { items: TodayItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Today" className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
        Today
      </span>
      {items.map((item, i) => {
        const primary = i === 0;
        return (
          <Link
            key={`${item.kind}-${item.href}`}
            href={item.href}
            className={
              primary
                ? "group inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-3.5 py-1.5 text-xs font-semibold text-white shadow-glass transition hover:brightness-110"
                : "group inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
            }
          >
            <span aria-hidden>{ICON[item.kind]}</span>
            <span className="max-w-[14rem] truncate">{item.label}</span>
            {item.hint && (
              <span
                className={
                  primary
                    ? "hidden text-[10px] font-normal text-white/80 sm:inline"
                    : "hidden text-[10px] text-white/45 sm:inline"
                }
              >
                {item.hint}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
