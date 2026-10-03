export type PeriodRange = { since: string; until: string };
export type PeriodPreset = "30days" | "90days" | "month" | "all";
export const periodOptions = [
  { value: "30days", label: "直近30日" },
  { value: "90days", label: "直近90日" },
  { value: "month", label: "今月" },
  { value: "all", label: "全期間" },
] as const;

/** Rolling ranges include today. Timestamp APIs need the entire final UTC day. */
export function periodRange(
  preset: PeriodPreset,
  dateOnly = false,
  now = new Date(),
): PeriodRange {
  if (preset === "all") return { since: "", until: "" };
  const end = now.toISOString().slice(0, 10);
  const start = new Date(`${end}T00:00:00.000Z`);
  if (preset === "month") start.setUTCDate(1);
  else start.setUTCDate(start.getUTCDate() - (preset === "30days" ? 29 : 89));
  const since = start.toISOString().slice(0, 10);
  return dateOnly
    ? { since, until: end }
    : { since: `${since}T00:00:00.000Z`, until: `${end}T23:59:59.999Z` };
}
export function samePeriod(a: PeriodRange, b: PeriodRange): boolean {
  return a.since === b.since && a.until === b.until;
}
