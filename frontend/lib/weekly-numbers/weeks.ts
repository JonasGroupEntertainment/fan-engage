
/**
 * Week boundaries for the admin "Week by week" page. Pure rules only.
 *
 * A week is Monday to Sunday on the New York calendar. Rows are put in a
 * week with weekIndexOf. The instants below are only used to ask the
 * database for "everything since the oldest week shown" and for labels.
 */

export const WEEKS_SHOWN = 8;
export const WEEK_TIME_ZONE = "America/New_York";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
/** 1970-01-01 was a Thursday, three days after the Monday of its week. */
const EPOCH_DAYS_AFTER_MONDAY = 3;
/**
 * Hours past UTC midnight at which the New York offset is sampled. 05:00 UTC
 * is midnight or 1am in New York, before the 2am clock change, so the offset
 * found is the one in force at local midnight.
 */
const OFFSET_SAMPLE_HOUR_UTC = 5;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type WeekWindow = {
  /** The week number (weekIndexOf). */
  index: number;
  /** Monday, as a New York calendar date (YYYY-MM-DD). */
  startDate: string;
  /** Sunday, as a New York calendar date (YYYY-MM-DD). */
  endDate: string;
  /** Monday 00:00 New York time, as a UTC instant. Inclusive. */
  startIso: string;
  /** The next Monday 00:00 New York time, as a UTC instant. Exclusive. */
  endIso: string;
  /** True for the current week, which is not finished yet. */
  inProgress: boolean;
};

function utcMidnightMs(dateStr: string): number {
  const match = CIVIL_DATE.exec(dateStr);
  if (!match) throw new Error(`Not a calendar date: ${dateStr}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function civilDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** How far New York wall time is from UTC at `instantMs`, in milliseconds. */
function newYorkOffsetMs(instantMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WEEK_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return wallAsUtc - instantMs;
}

/** The UTC instant of 00:00 New York time on a calendar date. */
export function newYorkMidnightIso(dateStr: string): string {
  const midnightUtc = utcMidnightMs(dateStr);
  const offset = newYorkOffsetMs(midnightUtc + OFFSET_SAMPLE_HOUR_UTC * 60 * 60 * 1000);
  return new Date(midnightUtc - offset).toISOString();
}

/** The Monday (calendar date) that starts the week with this index. */
export function weekStartDate(index: number): string {
  return civilDate((index * DAYS_PER_WEEK - EPOCH_DAYS_AFTER_MONDAY) * DAY_MS);
}

export function weekWindow(index: number, currentIndex: number): WeekWindow {
  const startDate = weekStartDate(index);
  const startMs = utcMidnightMs(startDate);
  return {
    index,
    startDate,
    endDate: civilDate(startMs + (DAYS_PER_WEEK - 1) * DAY_MS),
    startIso: newYorkMidnightIso(startDate),
    endIso: newYorkMidnightIso(weekStartDate(index + 1)),
    inProgress: index === currentIndex,
  };
}

/** The New York calendar date (YYYY-MM-DD) of an instant. */
export function newYorkDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Week number of an instant, measured on its New York calendar date. */
export function weekIndexOf(at: Date): number {
  const days = Math.floor(utcMidnightMs(newYorkDate(at)) / DAY_MS);
  return Math.floor((days + EPOCH_DAYS_AFTER_MONDAY) / DAYS_PER_WEEK);
}

/** The current week and the ones before it, newest first. */
export function recentWeeks(now: Date, count: number = WEEKS_SHOWN): WeekWindow[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Week count must be at least 1");
  const currentIndex = weekIndexOf(now);
  return Array.from({ length: count }, (_, back) => weekWindow(currentIndex - back, currentIndex));
}

function shortDate(dateStr: string): string {
  return new Date(utcMidnightMs(dateStr)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** "Nov 16 to Nov 22" */
export function formatWeekLabel(week: Pick<WeekWindow, "startDate" | "endDate">): string {
  return `${shortDate(week.startDate)} to ${shortDate(week.endDate)}`;
}
