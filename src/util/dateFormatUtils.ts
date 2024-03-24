/**
 * @description Convert a Date object to a string in ISO 8601 format.
 * @param {Date} date The Date object to convert.
 * @returns {string} The ISO 8601 string representation of the Date object.
 * @example
 * const date = new Date();
 * const isoString = dateToDatetimeString(date);
 */
export const dateToDatetimeString = (date: Date): string => {
  return date.toISOString();
};

/**
 * @description Convert a datetime string to a date string.
 * @param {string} datetime The datetime string to convert.
 * @returns {string} The date string representation of the datetime string.
 * @example
 * const datetime = "2022-01-01T12:00:00.000Z";
 * const dateString = dateTimetoDateString(datetime);
 */
export const dateTimetoDateString = (datetime: string): string => {
  return new Date(datetime).toISOString().split("T")[0];
};
