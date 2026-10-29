import { z } from "zod";
import { findRegistrationCity } from "./registration-cities";

export const REGISTRATION_CITY_ERROR = "Выберите город РФ из списка.";
export const registrationCitySchema = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string().transform((value, ctx) => {
    const city = findRegistrationCity(value);
    if (!city) {
      ctx.addIssue({ code: "custom", message: REGISTRATION_CITY_ERROR });
      return z.NEVER;
    }
    return city.value;
  }),
);
