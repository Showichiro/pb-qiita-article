import { z } from "@hono/zod-openapi";
import { isRealUtcDate, resolveTimeSeriesWindow } from "./calendar";

const dateMessage = (name: "since" | "until") =>
  `${name} must be a real UTC date (YYYY-MM-DD)`;

const utcDate = (name: "since" | "until") =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, dateMessage(name))
    .refine(isRealUtcDate, dateMessage(name));

const searchText = z
  .string()
  .trim()
  .max(200)
  .openapi({
    description:
      "Optional literal ASCII-case-insensitive substring of user id or user name. Max 200 characters.",
  })
  .optional()
  .transform((value) => value || undefined);

export const timeSeriesQuery = z
  .object({
    since: utcDate("since")
      .openapi({
        description:
          "Inclusive UTC calendar date, YYYY-MM-DD. Defaults to 89 days before until.",
        example: "2026-07-06",
      })
      .optional(),
    until: utcDate("until")
      .openapi({
        description:
          "Inclusive UTC calendar date, YYYY-MM-DD. Defaults to the current UTC date.",
        example: "2026-10-03",
      })
      .optional(),
    bucket: z
      .enum(["day", "week", "month"], {
        error: "bucket must be day, week, or month",
      })
      .default("day")
      .openapi({
        description:
          "day, week starting Monday UTC, or month starting on the first. Default day.",
        example: "day",
      }),
    author: searchText,
    tags: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) =>
        [
          ...new Set(
            (typeof value === "string" ? [value] : (value ?? []))
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ].sort(),
      )
      .pipe(z.array(z.string().max(100)).max(20))
      .openapi({
        type: "array",
        items: { type: "string", maxLength: 100 },
        param: { style: "form", explode: true },
        description:
          "Repeated exact tag names. An article must have every tag. Trimmed, then deduped and sorted. Max 20 tags.",
      }),
  })
  .transform((query, ctx) => {
    const resolved = resolveTimeSeriesWindow(query);
    if (!resolved.ok) {
      for (const issue of resolved.issues) {
        ctx.addIssue({
          code: "custom",
          path: [issue.path],
          message: issue.message,
        });
      }
    }
    return {
      ...query,
      since: resolved.ok ? resolved.since : (query.since ?? ""),
      until: resolved.ok ? resolved.until : (query.until ?? ""),
    };
  });

export type TimeSeriesQuery = z.infer<typeof timeSeriesQuery>;

const utcDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const safeCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const timeSeriesRowSchema = z.object({
  bucketStart: utcDateString.openapi({ example: "2026-01-01" }),
  articleCount: safeCount.openapi({
    description:
      "Articles whose UTC publication date falls in this bucket and inside since/until.",
    example: 1,
  }),
  publishedArticleLikes: safeCount.openapi({
    description:
      "Sum of the current likes_count snapshot for articles published in this bucket and inside since/until. Not likes earned during the bucket.",
    example: 2,
  }),
});

export const timeSeriesResponseSchema = z.object({
  since: utcDateString,
  until: utcDateString,
  bucket: z.enum(["day", "week", "month"]),
  rows: z.array(timeSeriesRowSchema),
});

export type TimeSeriesResponse = z.infer<typeof timeSeriesResponseSchema>;

export {
  TIME_SERIES_DEFAULT_DAYS,
  TIME_SERIES_MAX_BUCKETS,
  TIME_SERIES_MAX_DAYS,
  TIME_SERIES_MIN_YEAR,
  addUtcDays,
  countTimeSeriesBuckets,
  inclusiveUtcDayCount,
  isRealUtcDate,
  resolveTimeSeriesWindow,
  timeSeriesBucketStarts,
  utcMondayOnOrBefore,
  utcToday,
} from "./calendar";
export type { TimeSeriesBucket, TimeSeriesIssue } from "./calendar";
