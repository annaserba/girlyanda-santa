import { z } from "zod";
import { normalizeRussianPhone, RUSSIAN_PHONE_ERROR } from "./phone";

export const russianPhoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizeRussianPhone(value);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: RUSSIAN_PHONE_ERROR });
    return z.NEVER;
  }
  return phone;
});

// Existing optional contacts can still be cleared without inventing a number.
export const optionalRussianPhoneSchema = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? null : value),
  russianPhoneSchema.nullable().optional(),
);
