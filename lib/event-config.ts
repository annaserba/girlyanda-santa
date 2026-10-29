import { z } from "zod";

export const eventConfigSchema = z
  .object({
    registrationOpen: z.boolean(),
    budget: z.number().int().min(0).max(100000),
    registrationDeadline: z.string().date(),
    drawDate: z.string().date(),
    sendDeadline: z.string().date(),
    receiveDeadline: z.string().date(),
    finaleDate: z.string().date(),
    ringPolicy: z.enum(["single", "tracks"]),
    mapPublished: z.boolean(),
    locations: z
      .array(
        z.object({
          city: z.string().trim().min(1).max(120),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        }),
      )
      .max(300),
  })
  .refine(
    (v) =>
      v.registrationDeadline <= v.drawDate &&
      v.drawDate <= v.sendDeadline &&
      v.sendDeadline <= v.receiveDeadline &&
      v.receiveDeadline <= v.finaleDate,
    { message: "Проверьте порядок дат." },
  );

export type EventConfig = z.infer<typeof eventConfigSchema>;
// Dates and amount are proposals from the deck, not an approval or an automatic launch.
export const EVENT_DEFAULTS: EventConfig = {
  registrationOpen: true,
  budget: 1000,
  registrationDeadline: "2026-11-15",
  drawDate: "2026-11-17",
  sendDeadline: "2026-12-05",
  receiveDeadline: "2026-12-26",
  finaleDate: "2026-12-29",
  ringPolicy: "tracks",
  mapPublished: false,
  locations: [],
};

export const profileSchema = z
  .object({
    city: z.string().trim().min(1, "Укажите город.").max(120),
    site: z.string().trim().max(120).default(""),
    shift: z.string().trim().max(120).default(""),
    track: z.enum(["local", "country"]),
    pickupPoint: z.string().trim().max(500).default(""),
    wishes: z.string().trim().min(1, "Добавьте пожелания.").max(2000),
    reserveVolunteer: z.boolean().default(false),
    consent: z.boolean(),
  })
  .refine((v) => v.track !== "country" || !!v.pickupPoint, {
    message: "Для межгорода укажите пункт выдачи, без домашнего адреса.",
    path: ["pickupPoint"],
  });

export function profileReady(p: {
  city: string;
  site: string;
  shift: string;
  track: string | null;
  pickupPoint: string;
  wishes: string;
  reserveVolunteer: boolean;
}) {
  return profileSchema.safeParse({ ...p, consent: true }).success;
}

export function canonical(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}

export function sameSite(
  a: { city: string; site: string },
  b: { city: string; site: string },
) {
  return (
    canonical(a.city) === canonical(b.city) &&
    canonical(a.site) === canonical(b.site)
  );
}

export const giftKindLabels = {
  physical: "Обычный подарок",
  skill: "Подарок-навык",
  certificate: "Электронный сертификат",
};
