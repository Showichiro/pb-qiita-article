import { createLoader, createSerializer } from "nuqs/server";
import { articleQueryParams, parseArticleQuery } from "./articles";
import { analysisStateParams, parseAnalysisState } from "./analysis";
import { parseRankingQuery, rankingQueryParams } from "./ranking";
import {
  articleSearchParsers,
  analysisSearchParsers,
  rankingSearchParsers,
} from "./search-params";

const clock = new Date("2026-10-04T12:00:00Z");

test.each([
  "",
  "view=chart&topN=3",
  "topN=0",
  "topN=1000",
  "topN=1e2",
  "topN=9007199254740992",
  "since=2026-01-01T15%3A00%3A00.000Z&until=2026-01-03T14%3A59%3A59.999Z",
])("ranking parsers preserve existing URL semantics: %s", (raw) => {
  const original = parseRankingQuery(new URLSearchParams(raw));
  const values = createLoader(rankingSearchParsers)(raw);
  const serialized = createSerializer(rankingSearchParsers)(values);
  expect(parseRankingQuery(new URLSearchParams(serialized))).toEqual(original);
  expect(new URLSearchParams(serialized)).toEqual(rankingQueryParams(original));
});

test.each([
  "",
  "sort=likesCount%3Aasc",
  "limit=1e2&offset=0x10",
  "limit=1junk&offset=-1",
  "q=+React+&author=+writer+&tags=C%23&tags=a%2Cb&tags=C%23",
  "minLikes=0&maxLikes=1e2&minStocks=%2B2&maxStocks=0x10",
  "since=2026-01-01T15%3A00%3A00.000Z&until=2026-01-03T14%3A59%3A59.999Z",
])(
  "article parsers preserve filters, numeric syntax and the sort alias: %s",
  (raw) => {
    const original = parseArticleQuery(new URLSearchParams(raw));
    const loader = createLoader(articleSearchParsers);
    const serializer = createSerializer(articleSearchParsers);
    expect(
      parseArticleQuery(new URLSearchParams(serializer(loader(raw)))),
    ).toEqual(original);
    // Writing a committed query removes the old sort alias and normalizes tags.
    const written = new URLSearchParams(
      serializer(loader(articleQueryParams(original))),
    );
    expect(written.has("sort")).toBe(false);
    expect(written.getAll("tags")).toEqual(original.tags);
    expect(written.get("limit")).toBe(String(original.limit));
    expect(written.get("offset")).toBe(String(original.offset));
    expect(parseArticleQuery(written)).toEqual(original);
  },
);

test.each(["minLikes=-1", "maxStocks=1junk", "minLikes=5&maxLikes=1"])(
  "invalid article bounds remain visible to validation: %s",
  (raw) => {
    const values = createLoader(articleSearchParsers)(raw);
    const serialized = createSerializer(articleSearchParsers)(values);
    expect(() => parseArticleQuery(new URLSearchParams(serialized))).toThrow();
  },
);

test.each([
  "",
  "until=2026-01-03",
  "since=2026-01-01&until=2026-01-03&metric=likes&view=chart",
  "since=2026-02-31&bucket=invalid&view=invalid",
  "tags=a%2Cb&tags=C%23&tags=C%23&author=+writer+",
])(
  "analysis parsers preserve bootstrap-clock defaults and repeated tags: %s",
  (raw) => {
    const original = parseAnalysisState(new URLSearchParams(raw), clock);
    const loader = createLoader(analysisSearchParsers);
    const serializer = createSerializer(analysisSearchParsers);
    expect(
      parseAnalysisState(new URLSearchParams(serializer(loader(raw))), clock),
    ).toEqual(original);
    expect(
      parseAnalysisState(
        new URLSearchParams(serializer(loader(analysisStateParams(original)))),
        clock,
      ),
    ).toEqual(original);
  },
);
