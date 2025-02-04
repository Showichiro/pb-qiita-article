import { dateToDatetimeString } from "./dateFormatUtils";

export const processDateParam = (
  date: string | Date | null | undefined,
): string | null => {
  if (typeof date === "string") return date;
  if (date == null) return null;
  return dateToDatetimeString(date);
};
