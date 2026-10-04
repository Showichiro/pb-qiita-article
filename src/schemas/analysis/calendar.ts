import { japanDate } from "@/util/japanTime";
export const TIME_SERIES_DEFAULT_DAYS = 90;
export const TIME_SERIES_MAX_DAYS = 3660;
export const TIME_SERIES_MAX_BUCKETS = 400;
export const TIME_SERIES_MIN_YEAR = 1;

export type TimeSeriesBucket = "day" | "week" | "month";

export type TimeSeriesIssue = {
  path: "since" | "until" | "bucket";
  message: string;
};

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export const isRealUtcDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < TIME_SERIES_MIN_YEAR) return false;
  if (month < 1 || month > 12) return false;
  const length =
    MONTH_LENGTHS[month - 1] + (month === 2 && isLeapYear(year) ? 1 : 0);
  return day >= 1 && day <= length;
};

const parseUtcDate = (isoDate: string): Date => {
  const date = new Date(0);
  // setUTCFullYear keeps years 0-99; Date.UTC maps those onto 1900-1999.
  date.setUTCFullYear(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
  return date;
};

const formatUtcDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const sign = year < 0 ? "-" : "";
  return `${sign}${String(Math.abs(year)).padStart(4, "0")}-${month}-${day}`;
};

export const utcToday = (now = new Date()): string =>
  japanDate(now);

export const addUtcDays = (isoDate: string, days: number): string => {
  const date = parseUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
};

const addUtcMonths = (monthStart: string, months: number): string => {
  const date = new Date(0);
  date.setUTCFullYear(
    Number(monthStart.slice(0, 4)),
    Number(monthStart.slice(5, 7)) - 1 + months,
    1,
  );
  return formatUtcDate(date);
};

export const inclusiveUtcDayCount = (since: string, until: string): number => {
  const milliseconds =
    parseUtcDate(until).getTime() - parseUtcDate(since).getTime();
  return Math.round(milliseconds / 86_400_000) + 1;
};

export const utcMondayOnOrBefore = (isoDate: string): string => {
  const daysSinceMonday = (parseUtcDate(isoDate).getUTCDay() + 6) % 7;
  return addUtcDays(isoDate, -daysSinceMonday);
};

export const countTimeSeriesBuckets = (
  since: string,
  until: string,
  bucket: TimeSeriesBucket,
): number => {
  if (bucket === "day") return inclusiveUtcDayCount(since, until);
  if (bucket === "week") {
    const span =
      inclusiveUtcDayCount(
        utcMondayOnOrBefore(since),
        utcMondayOnOrBefore(until),
      ) - 1;
    if (span % 7 !== 0) {
      throw new Error("week bucket span is not a whole number of weeks");
    }
    return span / 7 + 1;
  }
  const sinceMonth =
    Number(since.slice(0, 4)) * 12 + Number(since.slice(5, 7)) - 1;
  const untilMonth =
    Number(until.slice(0, 4)) * 12 + Number(until.slice(5, 7)) - 1;
  return untilMonth - sinceMonth + 1;
};

export const timeSeriesBucketStarts = (
  since: string,
  until: string,
  bucket: TimeSeriesBucket,
): string[] => {
  const count = countTimeSeriesBuckets(since, until, bucket);
  if (bucket === "day") {
    return Array.from({ length: count }, (_, index) =>
      addUtcDays(since, index),
    );
  }
  if (bucket === "week") {
    const start = utcMondayOnOrBefore(since);
    return Array.from({ length: count }, (_, index) =>
      addUtcDays(start, index * 7),
    );
  }
  const start = `${since.slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, index) =>
    addUtcMonths(start, index),
  );
};

export const resolveTimeSeriesWindow = (
  input: { since?: string; until?: string; bucket: TimeSeriesBucket },
  now = new Date(),
):
  | {
      ok: true;
      since: string;
      until: string;
      bucket: TimeSeriesBucket;
      dayCount: number;
      bucketCount: number;
    }
  | { ok: false; issues: TimeSeriesIssue[] } => {
  const until = input.until ?? utcToday(now);
  const since =
    input.since ?? addUtcDays(until, 1 - TIME_SERIES_DEFAULT_DAYS);
  if (!isRealUtcDate(until)) {
    return {
      ok: false,
      issues: [
        {
          path: "until",
          message: "until must be a real Japan calendar date (YYYY-MM-DD)",
        },
      ],
    };
  }
  if (!isRealUtcDate(since)) {
    return {
      ok: false,
      issues: [
        {
          path: "since",
          message:
            "default 90-day window extends before the supported date range",
        },
      ],
    };
  }
  if (since > until) {
    return {
      ok: false,
      issues: [{ path: "since", message: "since must be on or before until" }],
    };
  }
  const issues: TimeSeriesIssue[] = [];
  const dayCount = inclusiveUtcDayCount(since, until);
  if (dayCount > TIME_SERIES_MAX_DAYS) {
    issues.push({
      path: "until",
      message: "date range must be at most 3660 days",
    });
  }
  const bucketCount = countTimeSeriesBuckets(since, until, input.bucket);
  if (bucketCount > TIME_SERIES_MAX_BUCKETS) {
    issues.push({
      path: "bucket",
      message: "bucket count must be at most 400",
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    since,
    until,
    bucket: input.bucket,
    dayCount,
    bucketCount,
  };
};
