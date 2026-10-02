import { z } from "@/lib";
import {
  addUtcDays,
  inclusiveUtcDayCount,
  isRealUtcDate,
  resolveTimeSeriesWindow,
  timeSeriesBucketStarts,
  timeSeriesQuery,
  utcMondayOnOrBefore,
} from "./index";

describe("time series calendar", () => {
  test("accepts real UTC dates and rejects impossible ones", () => {
    for (const value of [
      "0001-01-01",
      "0004-02-29",
      "2000-02-29",
      "2024-02-29",
      "2026-01-01",
    ]) {
      expect(isRealUtcDate(value)).toBe(true);
    }
    for (const value of [
      "0000-01-01",
      "2026-02-31",
      "2023-02-29",
      "1900-02-29",
      "0100-02-29",
      "2026-00-01",
      "2026-13-01",
      "2026-01-00",
      "2026-1-01",
      "2026-01-1",
      "2026-01-01T00:00:00Z",
      "",
      " 2026-01-01",
    ]) {
      expect(isRealUtcDate(value)).toBe(false);
    }
  });

  test("adds days across month, leap day, and years below 100", () => {
    expect(addUtcDays("2026-10-03", -89)).toBe("2026-07-06");
    expect(addUtcDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addUtcDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addUtcDays("2023-02-28", 1)).toBe("2023-03-01");
    expect(addUtcDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addUtcDays("0099-12-31", 1)).toBe("0100-01-01");
    expect(addUtcDays("0004-02-28", 1)).toBe("0004-02-29");
  });

  test("builds Monday and month starts, including partial boundaries", () => {
    expect(utcMondayOnOrBefore("2020-01-06")).toBe("2020-01-06");
    expect(utcMondayOnOrBefore("2026-01-05")).toBe("2026-01-05");
    expect(utcMondayOnOrBefore("0001-01-01")).toBe("0001-01-01");
    expect(utcMondayOnOrBefore("2026-01-04")).toBe("2025-12-29");
    expect(utcMondayOnOrBefore("2025-12-28")).toBe("2025-12-22");
    expect(timeSeriesBucketStarts("2026-01-01", "2026-01-03", "day")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(timeSeriesBucketStarts("2026-01-01", "2026-01-10", "week")).toEqual([
      "2025-12-29",
      "2026-01-05",
    ]);
    expect(timeSeriesBucketStarts("2026-01-04", "2026-01-05", "week")).toEqual([
      "2025-12-29",
      "2026-01-05",
    ]);
    expect(timeSeriesBucketStarts("2024-02-15", "2024-03-01", "month")).toEqual(
      ["2024-02-01", "2024-03-01"],
    );
    expect(timeSeriesBucketStarts("2025-12-15", "2026-01-02", "month")).toEqual(
      ["2025-12-01", "2026-01-01"],
    );
  });

  test("defaults to 90 UTC calendar days ending on the clock's UTC date", () => {
    expect(
      resolveTimeSeriesWindow(
        { bucket: "day" },
        new Date("2026-10-03T15:00:00.000Z"),
      ),
    ).toEqual({
      ok: true,
      since: "2026-07-06",
      until: "2026-10-03",
      bucket: "day",
      dayCount: 90,
      bucketCount: 90,
    });
    expect(
      resolveTimeSeriesWindow(
        { bucket: "day" },
        new Date("2026-10-03T15:00:00-09:00"),
      ),
    ).toMatchObject({ since: "2026-07-07", until: "2026-10-04", dayCount: 90 });
    expect(
      resolveTimeSeriesWindow(
        { until: "2026-01-31", bucket: "day" },
        new Date("2020-01-01T00:00:00.000Z"),
      ),
    ).toMatchObject({
      since: "2025-11-03",
      until: "2026-01-31",
      dayCount: 90,
    });
    expect(
      resolveTimeSeriesWindow(
        { since: "2026-01-01", bucket: "month" },
        new Date("2026-10-03T00:00:00.000Z"),
      ),
    ).toMatchObject({ since: "2026-01-01", until: "2026-10-03" });
  });

  test("rejects an implicit default window before the supported calendar", () => {
    expect(
      resolveTimeSeriesWindow({
        until: "0001-03-30",
        bucket: "day",
      }),
    ).toEqual({
      ok: false,
      issues: [
        {
          path: "since",
          message:
            "default 90-day window extends before the supported date range",
        },
      ],
    });
    expect(
      resolveTimeSeriesWindow({
        until: "0001-03-31",
        bucket: "day",
      }),
    ).toMatchObject({ ok: true, since: "0001-01-01", until: "0001-03-31" });
  });

  test("rejects inverted ranges and enforces day and bucket caps", () => {
    expect(
      resolveTimeSeriesWindow({
        since: "2026-01-02",
        until: "2026-01-01",
        bucket: "day",
      }),
    ).toEqual({
      ok: false,
      issues: [{ path: "since", message: "since must be on or before until" }],
    });
    const fourHundred = addUtcDays("2020-01-01", 399);
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-01",
        until: fourHundred,
        bucket: "day",
      }),
    ).toMatchObject({ ok: true, dayCount: 400, bucketCount: 400 });
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-01",
        until: addUtcDays("2020-01-01", 400),
        bucket: "day",
      }),
    ).toEqual({
      ok: false,
      issues: [{ path: "bucket", message: "bucket count must be at most 400" }],
    });
    const tooLong = addUtcDays("2020-01-01", 3660);
    expect(inclusiveUtcDayCount("2020-01-01", tooLong)).toBe(3661);
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-01",
        until: tooLong,
        bucket: "day",
      }),
    ).toEqual({
      ok: false,
      issues: [
        { path: "until", message: "date range must be at most 3660 days" },
        { path: "bucket", message: "bucket count must be at most 400" },
      ],
    });
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-01",
        until: addUtcDays("2020-01-01", 3659),
        bucket: "month",
      }),
    ).toMatchObject({ ok: true, dayCount: 3660 });
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-01",
        until: tooLong,
        bucket: "month",
      }),
    ).toEqual({
      ok: false,
      issues: [{ path: "until", message: "date range must be at most 3660 days" }],
    });
    expect(utcMondayOnOrBefore("2020-01-06")).toBe("2020-01-06");
    const weeksOk = addUtcDays("2020-01-06", 399 * 7);
    const weeksBad = addUtcDays("2020-01-06", 400 * 7);
    expect(inclusiveUtcDayCount("2020-01-06", weeksBad)).toBe(2801);
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-06",
        until: weeksOk,
        bucket: "week",
      }),
    ).toMatchObject({ ok: true, bucketCount: 400 });
    expect(
      resolveTimeSeriesWindow({
        since: "2020-01-06",
        until: weeksBad,
        bucket: "week",
      }),
    ).toEqual({
      ok: false,
      issues: [{ path: "bucket", message: "bucket count must be at most 400" }],
    });
  });
});

describe("time series query validation", () => {
  test("normalizes author and repeated tags", () => {
    expect(
      timeSeriesQuery.parse({
        since: "2026-01-01",
        until: "2026-01-03",
        author: " writer ",
        tags: [" z ", "C#", "", "z", "a,b"],
      }),
    ).toMatchObject({
      author: "writer",
      tags: ["C#", "a,b", "z"],
      bucket: "day",
    });
    expect(
      timeSeriesQuery.parse({
        since: "2026-01-01",
        until: "2026-01-01",
        tags: " C# ",
        author: " ",
      }).tags,
    ).toEqual(["C#"]);
    expect(
      timeSeriesQuery.parse({
        until: "2026-01-31",
        bucket: "month",
      }),
    ).toMatchObject({
      since: "2025-11-03",
      until: "2026-01-31",
    });
    expect(
      timeSeriesQuery.parse({
        since: "2026-01-01",
        until: "2026-01-01",
        tags: Array.from({ length: 21 }, () => "Go"),
      }).tags,
    ).toEqual(["Go"]);
    expect(
      timeSeriesQuery.parse({
        since: "2026-01-01",
        until: "2026-01-01",
        author: "a".repeat(200),
      }).author,
    ).toBe("a".repeat(200));
  });

  test.each([
    { since: "2026-02-31" },
    { since: "0000-01-01" },
    { since: "2023-02-29" },
    { since: "1900-02-29" },
    { until: "2026-01-01T00:00:00Z" },
    { since: "" },
    { since: "2026-01-02", until: "2026-01-01" },
    { bucket: "year", since: "2026-01-01", until: "2026-01-01" },
    { since: "2026-01-01", until: "2026-01-01", author: "a".repeat(201) },
    { since: "2026-01-01", until: "2026-01-01", tags: "a".repeat(101) },
    {
      since: "2026-01-01",
      until: "2026-01-01",
      tags: Array.from({ length: 21 }, (_, index) => String(index)),
    },
    { until: "0001-03-30" },
  ])("rejects %j", (query) => {
    expect(timeSeriesQuery.safeParse(query).success).toBe(false);
  });

  test("formats stable field errors", () => {
    const invalid = timeSeriesQuery.safeParse({ since: "2026-02-31" });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(z.formatError(invalid.error)).toEqual({
        _errors: [],
        since: { _errors: ["since must be a real UTC date (YYYY-MM-DD)"] },
      });
    }
    const inverted = timeSeriesQuery.safeParse({
      since: "2026-01-02",
      until: "2026-01-01",
    });
    expect(inverted.success).toBe(false);
    if (!inverted.success) {
      expect(z.formatError(inverted.error)).toEqual({
        _errors: [],
        since: { _errors: ["since must be on or before until"] },
      });
    }
    const bucket = timeSeriesQuery.safeParse({
      since: "2026-01-01",
      until: "2026-01-01",
      bucket: "year",
    });
    expect(bucket.success).toBe(false);
    if (!bucket.success) {
      expect(z.formatError(bucket.error)).toEqual({
        _errors: [],
        bucket: { _errors: ["bucket must be day, week, or month"] },
      });
    }
  });
});
