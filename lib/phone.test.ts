import { describe, expect, it } from "vitest";
import { normalizeRussianPhone } from "./phone";
import { optionalRussianPhoneSchema, russianPhoneSchema } from "./phone-schema";

describe("Russian contact phone validation", () => {
  it.each([
    ["+7 (999) 123-45-67", "79991234567"],
    ["79991234567", "79991234567"],
    ["8 (999) 123-45-67", "79991234567"],
    ["9991234567", "79991234567"],
    [" +7 (495) 123-45-67 ", "74951234567"],
    ["+7 978 812 74 02", "79788127402"],
  ])("normalizes %s to international digits", (input, expected) => {
    expect(normalizeRussianPhone(input)).toBe(expected);
    expect(russianPhoneSchema.parse(input)).toBe(expected);
  });

  it.each([
    "",
    "+ ()",
    "+1 202 555 0100",
    "+375 29 1234567",
    "+7 701 555 0100",
    "8 701 555 0100",
    "+7 7172 580659",
    "+7 999 123",
    "+7 999 123456789",
    "+7 000 000 0000",
    "+7 123 4567890",
    "+7 999 1234567 доб. 5",
    "call +7 999 1234567",
    "+8 999 1234567",
  ])("rejects a foreign, incomplete or malformed contact: %s", (input) => {
    expect(normalizeRussianPhone(input)).toBeNull();
    expect(russianPhoneSchema.safeParse(input).success).toBe(false);
    if (input)
      expect(optionalRussianPhoneSchema.safeParse(input).success).toBe(false);
  });

  it("keeps optional clearing and omitted updates compatible", () => {
    expect(optionalRussianPhoneSchema.parse(undefined)).toBeUndefined();
    expect(optionalRussianPhoneSchema.parse(null)).toBeNull();
    expect(optionalRussianPhoneSchema.parse("  ")).toBeNull();
    expect(optionalRussianPhoneSchema.parse("")).toBeNull();
    expect(optionalRussianPhoneSchema.safeParse(79991234567).success).toBe(
      false,
    );
    expect(russianPhoneSchema.safeParse(null).success).toBe(false);
  });
});
