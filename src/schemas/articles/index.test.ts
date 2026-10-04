import { articlesQuery } from "./index";

describe("article search query validation", () => {
  test("native combined sort takes precedence over legacy hidden fields", () => {
    expect(articlesQuery.parse({ sort: "likesCount:asc", orderField: "createdAt", orderDirection: "desc" })).toMatchObject({ orderField: "likesCount", orderDirection: "asc" });
    expect(articlesQuery.safeParse({ sort: "unknown:asc" }).success).toBe(false);
  });
  test("normalizes text and single/repeated tags without CSV splitting", () => {
    expect(
      articlesQuery.parse({
        q: " hi ",
        author: " user ",
        tags: ["z", " C# ", "", "z", "a,b"],
      }),
    ).toMatchObject({ q: "hi", author: "user", tags: ["C#", "a,b", "z"] });
    expect(articlesQuery.parse({ tags: " C# " }).tags).toEqual(["C#"]);
    expect(
      articlesQuery.parse({
        q: " ",
        author: " ",
        tags: " ",
        minLikes: "",
        maxStocks: " ",
      }),
    ).toMatchObject({
      q: undefined,
      author: undefined,
      tags: [],
      minLikes: undefined,
      maxStocks: undefined,
    });
  });
  test.each(["minLikes", "maxLikes", "minStocks", "maxStocks"])(
    "validates %s safe nonnegative integers",
    (field) => {
      for (const value of ["-1", "1.5", "no", "Infinity", "9007199254740992"]) {
        expect(articlesQuery.safeParse({ [field]: value }).success).toBe(false);
      }
      expect(articlesQuery.parse({ [field]: "0" })[field as "minLikes"]).toBe(
        0,
      );
      expect(
        articlesQuery.parse({ [field]: String(Number.MAX_SAFE_INTEGER) })[
          field as "minLikes"
        ],
      ).toBe(Number.MAX_SAFE_INTEGER);
    },
  );
  test.each([
    { minLikes: "2", maxLikes: "1" },
    { minStocks: "2", maxStocks: "1" },
    { q: "x".repeat(201) },
    { author: "x".repeat(201) },
    { tags: "x".repeat(101) },
    { tags: Array.from({ length: 21 }, (_, i) => String(i)) },
  ])("rejects invalid filter %j", (query) => {
    expect(articlesQuery.safeParse(query).success).toBe(false);
  });
  test("accepts inclusive ranges and existing defaults", () => {
    expect(articlesQuery.parse({ minLikes: "1", maxLikes: "1" })).toMatchObject(
      { minLikes: 1, maxLikes: 1, limit: 10, offset: 0 },
    );
  });
});
