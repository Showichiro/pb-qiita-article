import { timeSeriesRoute } from "./index";

describe("time series OpenAPI route", () => {
  test("documents publication buckets and current like snapshots", () => {
    expect(timeSeriesRoute.method).toBe("get");
    expect(timeSeriesRoute.path).toBe("/api/analysis/time-series");
    expect(timeSeriesRoute.responses[200].description).toContain(
      "current likes_count snapshot",
    );
    expect(timeSeriesRoute.responses[200].description).toContain(
      "not likes earned during that bucket",
    );
  });
});
