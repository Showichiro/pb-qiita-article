import {
  createParser,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

const rankingTopN = createParser({
  parse: (value) => {
    if (!/^\d+$/.test(value)) return null;
    const count = Number(value);
    return Number.isSafeInteger(count)
      ? Math.max(1, Math.min(100, count))
      : null;
  },
  serialize: String,
}).withDefault(10);

export const rankingSearchParsers = {
  since: parseAsString.withDefault(""),
  until: parseAsString.withDefault(""),
  view: parseAsStringLiteral(["table", "chart"]).withDefault("table"),
  topN: rankingTopN,
};

function boundedInteger(defaultValue: number, min: number, max: number) {
  return createParser({
    parse: (value) => {
      if (!value.trim()) return null;
      const count = Number(value);
      return Number.isSafeInteger(count) && count >= min && count <= max
        ? count
        : null;
    },
    serialize: String,
  })
    .withDefault(defaultValue)
    .withOptions({ clearOnDefault: false });
}

export const articleSearchParsers = {
  q: parseAsString.withDefault(""),
  author: parseAsString.withDefault(""),
  tags: parseAsNativeArrayOf(parseAsString),
  // Preserve invalid input for the existing cross-field validator to report,
  // rather than silently converting an invalid bound to an unfiltered search.
  minLikes: parseAsString,
  maxLikes: parseAsString,
  minStocks: parseAsString,
  maxStocks: parseAsString,
  since: parseAsString.withDefault(""),
  until: parseAsString.withDefault(""),
  orderField: parseAsStringLiteral(["createdAt", "likesCount", "stocksCount"])
    .withDefault("createdAt")
    .withOptions({ clearOnDefault: false }),
  orderDirection: parseAsStringLiteral(["asc", "desc"])
    .withDefault("desc")
    .withOptions({ clearOnDefault: false }),
  limit: boundedInteger(10, 1, 100),
  offset: boundedInteger(0, 0, Number.MAX_SAFE_INTEGER),
  sort: parseAsString.withDefault(""),
};

export const analysisSearchParsers = {
  // Resolve missing dates with the SSR bootstrap clock in parseAnalysisState.
  since: parseAsString.withDefault(""),
  until: parseAsString.withDefault(""),
  bucket: parseAsStringLiteral(["day", "week", "month"]).withDefault("day"),
  author: parseAsString.withDefault(""),
  tags: parseAsNativeArrayOf(parseAsString),
  metric: parseAsStringLiteral(["posts", "likes"]).withDefault("posts"),
  view: parseAsStringLiteral(["table", "chart"]).withDefault("table"),
};
