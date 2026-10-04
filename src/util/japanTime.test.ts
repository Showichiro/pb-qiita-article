import { describe, expect, test } from "vitest";
import { japanDate, japanDateBoundary } from "./japanTime";
import { articlesQuery } from "@/schemas/articles";
import { countQuery } from "@/schemas/ranking/articleCount";

describe("Japan calendar dates", () => {
  test("switches dates at midnight in Japan, including the year boundary", () => {
    expect(japanDate("2025-12-31T14:59:59.999Z")).toBe("2025-12-31");
    expect(japanDate("2025-12-31T15:00:00Z")).toBe("2026-01-01");
    expect(japanDate("2026-01-01T00:30:00+09:00")).toBe("2026-01-01");
    expect(japanDate("2026-01-01")).toBe("2026-01-01");
  });

  test("date-only article and ranking searches include the entire Japanese day", () => {
    for (const schema of [articlesQuery, countQuery]) {
      const result = schema.parse({ since: "2026-01-01", until: "2026-01-01" });
      expect(result.since).toEqual(new Date("2025-12-31T15:00:00Z"));
      expect(result.until).toEqual(new Date("2026-01-01T14:59:59.999Z"));
    }
    expect(japanDateBoundary("2026-01-01T00:00:00Z")).toBe(
      "2026-01-01T00:00:00Z",
    );
  });
});
