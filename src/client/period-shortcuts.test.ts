import { periodRange } from "./period-shortcuts";
import { analysisDraftError } from "./analysis";
import { describe, expect, test } from "vitest";
describe("period shortcuts", () => {
  test("includes exactly 30 UTC dates across leap February and the complete final day", () => {
    expect(
      periodRange("30days", false, new Date("2024-03-01T00:30:00+09:00")),
    ).toEqual({
      since: "2024-01-31T00:00:00.000Z",
      until: "2024-02-29T23:59:59.999Z",
    });
  });
  test("uses UTC month boundaries and handles year rollover", () => {
    expect(
      periodRange("month", true, new Date("2026-01-01T05:00:00Z")),
    ).toEqual({ since: "2026-01-01", until: "2026-01-01" });
    expect(
      periodRange("90days", true, new Date("2026-01-01T05:00:00Z")),
    ).toEqual({ since: "2025-10-04", until: "2026-01-01" });
    expect(periodRange("all")).toEqual({ since: "", until: "" });
  });
  test("all bounded presets satisfy analysis validation", () => {
    for (const preset of ["30days", "90days", "month"] as const)
      expect(
        analysisDraftError({
          ...periodRange(preset, true),
          bucket: "day",
          author: "",
          tags: [],
        }),
      ).toBeNull();
  });
});
