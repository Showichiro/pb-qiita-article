/** Calendar dates are always interpreted in Japan, regardless of host timezone. */
export const japanDate = (value: string | Date): string => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
};

/** Explicit timestamps retain their instant; date-only filters include the full day. */
export const japanDateBoundary = (value: unknown, end = false): unknown =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(
        `${value}T${end ? "23:59:59.999" : "00:00:00.000"}+09:00`,
      ).toISOString()
    : value;
