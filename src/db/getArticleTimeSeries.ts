import type { DrizzleD1Database } from "@/lib";
import {
  countTimeSeriesBuckets,
  inclusiveUtcDayCount,
  isRealUtcDate,
  TIME_SERIES_MAX_BUCKETS,
  TIME_SERIES_MAX_DAYS,
  timeSeriesBucketStarts,
  timeSeriesResponseSchema,
  type TimeSeriesBucket,
  type TimeSeriesResponse,
} from "@/schemas";
import { assertGenerationPublished } from "./dataGenerations";
import { sql, type SQL } from "drizzle-orm";
import * as schema from "./schema";

export type ArticleTimeSeriesConfig = {
  since: string;
  until: string;
  bucket: TimeSeriesBucket;
  author?: string;
  tags?: string[];
};

const toSafeNonnegativeInteger = (value: unknown): number => {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        "time series aggregate is not a safe nonnegative integer",
      );
    }
    return Number(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        "time series aggregate is not a safe nonnegative integer",
      );
    }
    return value;
  }
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  throw new Error("time series aggregate is not a safe nonnegative integer");
};

const bucketStartSql = (bucket: TimeSeriesBucket) => {
  const utcDate = sql`date(${schema.generationArticles.createdAt})`;
  if (bucket === "day") return utcDate;
  // weekday 1 advances to Monday, so six days earlier selects Monday on or before.
  if (bucket === "week") return sql`date(${utcDate}, '-6 days', 'weekday 1')`;
  return sql`date(${utcDate}, 'start of month')`;
};

const assertSupportedWindow = (
  since: string,
  until: string,
  bucket: TimeSeriesBucket,
) => {
  if (
    !isRealUtcDate(since) ||
    !isRealUtcDate(until) ||
    since > until ||
    inclusiveUtcDayCount(since, until) > TIME_SERIES_MAX_DAYS ||
    countTimeSeriesBuckets(since, until, bucket) > TIME_SERIES_MAX_BUCKETS
  ) {
    throw new Error("time series range is outside the supported bounds");
  }
};

export const getArticleTimeSeries = async (
  db: DrizzleD1Database<typeof schema>,
  generationId: string,
  config: ArticleTimeSeriesConfig,
): Promise<TimeSeriesResponse> => {
  const { since, until, bucket } = config;
  assertSupportedWindow(since, until, bucket);
  await assertGenerationPublished(db, generationId);
  const author = config.author?.trim();
  const tags = [
    ...new Set(config.tags?.map((tag) => tag.trim()).filter(Boolean)),
  ];
  const filters: SQL[] = [
    sql`${schema.generationArticles.generationId} = ${generationId}`,
    // Half-open UTC instant range: since 00:00 through the end of until.
    sql`julianday(${schema.generationArticles.createdAt}) >= julianday(${since}) and julianday(${schema.generationArticles.createdAt}) < (julianday(${until}) + 1)`,
  ];
  if (author) {
    filters.push(
      sql`(instr(lower(${schema.generationArticles.userId}), lower(${author})) > 0 or instr(lower(${schema.generationArticles.userName}), lower(${author})) > 0)`,
    );
  }
  for (const tag of tags) {
    filters.push(
      sql`exists (select 1 from generation_tags as selected_tag where selected_tag.generation_id = ${generationId} and selected_tag.article_id = ${schema.generationArticles.id} and selected_tag.name = ${tag})`,
    );
  }
  const aggregated = await db.all<Record<string, unknown>>(sql`
    select ${bucketStartSql(bucket)} as bucketStart,
           count(*) as articleCount,
           sum(${schema.generationArticles.likesCount}) as publishedArticleLikes
    from ${schema.generationArticles}
    where ${sql.join(filters, sql` and `)}
    group by 1
  `);
  const rowsByStart = new Map<
    string,
    { articleCount: number; publishedArticleLikes: number }
  >();
  for (const row of aggregated) {
    const bucketStart = row.bucketStart;
    if (typeof bucketStart !== "string") {
      throw new Error("time series bucket is outside the selected range");
    }
    if (rowsByStart.has(bucketStart)) {
      throw new Error(`duplicate time series bucket ${bucketStart}`);
    }
    rowsByStart.set(bucketStart, {
      articleCount: toSafeNonnegativeInteger(row.articleCount),
      publishedArticleLikes: toSafeNonnegativeInteger(
        row.publishedArticleLikes,
      ),
    });
  }
  const expected = timeSeriesBucketStarts(since, until, bucket);
  const expectedStarts = new Set(expected);
  for (const bucketStart of rowsByStart.keys()) {
    if (!expectedStarts.has(bucketStart)) {
      throw new Error(
        `time series bucket ${bucketStart} is outside the selected range`,
      );
    }
  }
  return timeSeriesResponseSchema.parse({
    since,
    until,
    bucket,
    rows: expected.map((bucketStart) => ({
      bucketStart,
      articleCount: rowsByStart.get(bucketStart)?.articleCount ?? 0,
      publishedArticleLikes:
        rowsByStart.get(bucketStart)?.publishedArticleLikes ?? 0,
    })),
  });
};
