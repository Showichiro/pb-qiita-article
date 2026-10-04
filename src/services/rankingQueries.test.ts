import type { getArticleCountGroupByUser } from "@/db";
import { loadRankingPageData, rankingConfig } from "./rankingQueries";

const db = {} as Parameters<typeof getArticleCountGroupByUser>[0];

it("loads both rankings concurrently for the same generation and request", async () => {
  let resolvePosts!: (rows: []) => void;
  let resolveLikes!: (rows: []) => void;
  const source = {
    getArticleCountGroupByUser: vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolvePosts = resolve;
        }),
    ),
    getLikesCountGroupByUser: vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolveLikes = resolve;
        }),
    ),
  };
  const query = { since: "2026-01-01", until: null };
  const pending = loadRankingPageData(
    db,
    query,
    new URLSearchParams("since=2026-01-01&view=chart&topN=5"),
    "v2",
    8,
    source,
  );
  expect(source.getArticleCountGroupByUser).toHaveBeenCalledExactlyOnceWith(
    db,
    "v2",
    rankingConfig(query),
  );
  expect(source.getLikesCountGroupByUser).toHaveBeenCalledExactlyOnceWith(
    db,
    "v2",
    rankingConfig(query),
  );
  resolvePosts([]);
  resolveLikes([]);
  const page = await pending;
  expect(page.config).toEqual({
    since: "2026-01-01",
    until: "",
    view: "chart",
    topN: 5,
  });
  expect(JSON.parse(page.bootstrap)).toEqual({
    config: page.config,
    postCounts: [],
    likesCounts: [],
    dataVersion: "v2",
    publishedSequence: 8,
  });
});

it("propagates failure of either ranking instead of publishing a partial bootstrap", async () => {
  const error = new Error("ranking unavailable");
  for (const failing of ["posts", "likes"]) {
    const source = {
      getArticleCountGroupByUser: vi.fn(async () => {
        if (failing === "posts") throw error;
        return [];
      }),
      getLikesCountGroupByUser: vi.fn(async () => {
        if (failing === "likes") throw error;
        return [];
      }),
    };
    await expect(
      loadRankingPageData(
        db,
        { since: null, until: null },
        new URLSearchParams(),
        "v1",
        1,
        source,
      ),
    ).rejects.toBe(error);
  }
});
