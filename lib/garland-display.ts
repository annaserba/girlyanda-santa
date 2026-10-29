import { canonical, type EventConfig } from "./event-config";
import type { getGarlandSnapshot } from "./garland-snapshot";
import type { summarizeGifts } from "./garland-summary";
import { findRussianCity } from "./russian-cities";

// Geographic anchors requested by the organiser, not fictional participants.
const PLANNED_CITIES = [
  { city: "Москва", latitude: 55.75, longitude: 37.62 },
  { city: "Уфа", latitude: 54.74, longitude: 55.97 },
  { city: "Мурманск", latitude: 68.97, longitude: 33.07 },
  { city: "Екатеринбург", latitude: 56.84, longitude: 60.6 },
  { city: "Новосибирск", latitude: 55.03, longitude: 82.92 },
  { city: "Норильск", latitude: 69.35, longitude: 88.2 },
  { city: "Якутск", latitude: 62.03, longitude: 129.73 },
  { city: "Владивосток", latitude: 43.12, longitude: 131.9 },
] as const;

type Schedule = Pick<
  EventConfig,
  | "registrationDeadline"
  | "drawDate"
  | "sendDeadline"
  | "receiveDeadline"
  | "finaleDate"
>;
const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Dates affect decorative brightness only, never registration or gift counts. */
export function getGarlandDecoration(schedule: Schedule, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const today = dayNumber(`${parts.year}-${parts.month}-${parts.day}`);
  const milestones = [
    { day: dayNumber(schedule.registrationDeadline) - 30, intensity: 0.55 },
    { day: dayNumber(schedule.registrationDeadline), intensity: 0.65 },
    { day: dayNumber(schedule.drawDate), intensity: 0.75 },
    { day: dayNumber(schedule.sendDeadline), intensity: 0.85 },
    { day: dayNumber(schedule.receiveDeadline), intensity: 0.95 },
    { day: dayNumber(schedule.finaleDate), intensity: 1 },
  ];
  let previous = milestones[0];
  if (today < previous.day) return { intensity: previous.intensity };
  for (const next of milestones.slice(1)) {
    if (today < next.day) {
      const progress = (today - previous.day) / (next.day - previous.day);
      return {
        intensity: Number(
          (
            previous.intensity +
            progress * (next.intensity - previous.intensity)
          ).toFixed(3),
        ),
      };
    }
    previous = next;
  }
  return { intensity: 1 };
}

export function getGarlandDisplay(
  snapshot: Awaited<ReturnType<typeof getGarlandSnapshot>>,
  schedule: Schedule,
  now = new Date(),
) {
  type City = ReturnType<typeof summarizeGifts>["cities"][number];
  const cities = new Map<string, City>(
    PLANNED_CITIES.map((location) => [
      canonical(location.city),
      {
        city: location.city,
        total: 0,
        received: 0,
        sites: [],
        location: { ...location },
      },
    ]),
  );
  for (const city of snapshot.summary.cities) {
    const key = canonical(city.city);
    cities.set(key, {
      ...city,
      location:
        city.location ??
        cities.get(key)?.location ??
        findRussianCity(city.city),
    });
  }
  return {
    phase: snapshot.phase,
    summary: {
      ...snapshot.summary,
      cities: [...cities.values()].sort((a, b) =>
        a.city.localeCompare(b.city, "ru"),
      ),
    },
    decoration: getGarlandDecoration(schedule, now),
  };
}
