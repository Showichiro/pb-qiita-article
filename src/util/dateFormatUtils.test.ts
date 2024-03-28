import { dateTimetoDateString, dateToDatetimeString } from "./dateFormatUtils";

describe("dateFormatUtils", () => {
  describe("dateToDatetimeString", () => {
    it("should convert date to datetime string", () => {
      const date = new Date("2022-01-01T00:00:00.000Z");
      expect(dateToDatetimeString(date)).toBe("2022-01-01T00:00:00.000Z");
    });
  });

  describe("dateTimetoDateString", () => {
    it("should convert datetime string to date string", () => {
      const datetimeString = "2022-01-01T00:00:00.000Z";
      expect(dateTimetoDateString(datetimeString)).toBe("2022-01-01");
    });
  });
});
