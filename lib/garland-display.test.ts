import { describe, expect, it } from "vitest";
import { getGarlandDisplay, getGarlandDecoration } from "./garland-display";
import { summarizeGifts } from "./garland-summary";
import { EVENT_DEFAULTS } from "./event-config";

const now = new Date("2026-10-29T12:00:00Z");
function snapshot(
  total: number,
  phase: "registration" | "gifts" = "registration",
) {
  return {
    phase,
    summary: summarizeGifts(
      Array.from({ length: total }, (_, i) => ({
        city: "Реальный город",
        site: "Настоящая площадка",
        receivedAt: phase === "gifts" && i === 0 ? new Date() : null,
      })),
      EVENT_DEFAULTS,
    ),
  };
}

describe("reference cities without fictional registrations or gifts", () => {
  it.each([0, 1, 7, 8, 9, 1500])(
    "preserves factual counts at %i participants",
    (total) => {
      const actual = snapshot(total);
      const before = structuredClone(actual);
      const display = getGarlandDisplay(actual, EVENT_DEFAULTS, now);
      expect(display.phase).toBe(actual.phase);
      expect(display.summary.total).toBe(total);
      expect(display.summary.received).toBe(0);
      expect(
        display.summary.cities.reduce((sum, city) => sum + city.total, 0),
      ).toBe(total);
      expect(
        display.summary.cities.reduce((sum, city) => sum + city.received, 0),
      ).toBe(0);
      if (total)
        expect(
          display.summary.cities.find((city) => city.city === "Реальный город"),
        ).toEqual(actual.summary.cities[0]);
      expect(actual).toEqual(before);
      expect(JSON.stringify(display)).not.toMatch(
        /Демо|Демонстрацион|Пример|isDemo/,
      );
    },
  );
  it("keeps eight geographic anchors with zero people, gifts and sites when empty", () => {
    const display = getGarlandDisplay(snapshot(0), EVENT_DEFAULTS, now);
    expect(display.summary.cities).toHaveLength(8);
    expect(display.summary.cities.map((city) => city.city)).toContain("Уфа");
    expect(display.summary.cities.map((city) => city.city)).not.toContain(
      "Краснодар",
    );
    for (const city of display.summary.cities) {
      expect(city).toMatchObject({ total: 0, received: 0, sites: [] });
      expect(city.location).not.toBeNull();
    }
  });
  it("adds a participant's new city to the anchors using offline coordinates", () => {
    const actual = {
      phase: "registration" as const,
      summary: summarizeGifts(
        [{ city: "Тюмень", site: "Офис", receivedAt: null }],
        EVENT_DEFAULTS,
      ),
    };
    const display = getGarlandDisplay(actual, EVENT_DEFAULTS, now);
    expect(display.summary.cities).toHaveLength(9);
    expect(
      display.summary.cities.find((city) => city.city === "Тюмень"),
    ).toMatchObject({
      total: 1,
      received: 0,
      location: { city: "Тюмень" },
    });
    expect(display.summary.total).toBe(1);
    expect(actual.summary.cities[0].location).toBeNull();
  });
  it("keeps base cities at any attendance and allows Krasnodar only as an actual participant city", () => {
    const actual = {
      phase: "registration" as const,
      summary: summarizeGifts(
        Array.from({ length: 12 }, () => ({
          city: "Краснодар",
          site: "Офис",
          receivedAt: null,
        })),
        EVENT_DEFAULTS,
      ),
    };
    const display = getGarlandDisplay(actual, EVENT_DEFAULTS, now);
    expect(display.summary.cities).toHaveLength(9);
    expect(
      display.summary.cities.find((city) => city.city === "Уфа")?.total,
    ).toBe(0);
    expect(
      display.summary.cities.find((city) => city.city === "Краснодар"),
    ).toMatchObject({
      total: 12,
      location: { city: "Краснодар" },
    });
  });
  it("merges a factual city by normalized name and prefers organiser coordinates", () => {
    const actual = {
      phase: "gifts" as const,
      summary: {
        total: 1,
        received: 1,
        cities: [
          {
            city: " москва ",
            total: 1,
            received: 1,
            sites: [{ site: "Склад", total: 1, received: 1 }],
            location: { city: "Москва", latitude: 55.8, longitude: 37.7 },
          },
        ],
      },
    };
    const display = getGarlandDisplay(actual, EVENT_DEFAULTS, now);
    expect(display.summary.cities).toHaveLength(8);
    expect(display.summary.cities.find((city) => city.total)).toEqual(
      actual.summary.cities[0],
    );
    expect(display.summary).toMatchObject({ total: 1, received: 1 });
  });
  it("uses a known city anchor when actual coordinates are missing, without changing counts", () => {
    const actual = {
      phase: "registration" as const,
      summary: summarizeGifts(
        [{ city: "Москва", site: "Офис", receivedAt: null }],
        EVENT_DEFAULTS,
      ),
    };
    expect(
      getGarlandDisplay(actual, EVENT_DEFAULTS, now).summary.cities.find(
        (city) => city.city === "Москва",
      ),
    ).toMatchObject({
      total: 1,
      received: 0,
      location: { longitude: 37.62, latitude: 55.75 },
    });
    expect(actual.summary.cities[0].location).toBeNull();
  });
  it("changes only decoration by date, never confirmed gifts or registration phase", () => {
    const actual = snapshot(1, "gifts");
    const early = getGarlandDisplay(
      actual,
      EVENT_DEFAULTS,
      new Date("2026-10-01T12:00:00Z"),
    );
    const late = getGarlandDisplay(
      actual,
      EVENT_DEFAULTS,
      new Date("2027-01-01T12:00:00Z"),
    );
    expect(early.summary).toEqual(late.summary);
    expect(early.phase).toBe("gifts");
    expect(late.phase).toBe("gifts");
    expect(early.decoration.intensity).toBeLessThan(late.decoration.intensity);
    expect(late.summary.received).toBe(1);
  });
  it("does not share mutable anchors across requests", () => {
    const first = getGarlandDisplay(snapshot(0), EVENT_DEFAULTS, now);
    first.summary.cities[0].total = 999;
    expect(
      getGarlandDisplay(snapshot(0), EVENT_DEFAULTS, now).summary.cities[0]
        .total,
    ).toBe(0);
  });
});

describe("calendar decoration from event dates, Moscow time and no live refresh", () => {
  it.each([
    ["2026-10-01T12:00:00Z", 0.55],
    ["2026-11-15T12:00:00Z", 0.65],
    ["2026-11-17T12:00:00Z", 0.75],
    ["2026-12-19T12:00:00Z", 0.85],
    ["2026-12-26T12:00:00Z", 0.95],
    ["2026-12-29T12:00:00Z", 1],
    ["2027-01-01T12:00:00Z", 1],
  ])("uses configured date milestones: %s", (date, intensity) => {
    expect(getGarlandDecoration(EVENT_DEFAULTS, new Date(date)).intensity).toBe(
      intensity,
    );
  });
  it("uses Moscow midnight and remains stable within a calendar day", () => {
    const at = (date: string) =>
      getGarlandDecoration(EVENT_DEFAULTS, new Date(date));
    expect(at("2026-11-14T21:00:00Z").intensity).toBe(0.65);
    expect(at("2026-11-14T20:59:59Z").intensity).toBeLessThan(0.65);
    expect(at("2026-11-15T20:59:59Z")).toEqual(at("2026-11-14T21:00:00Z"));
  });
  it("follows changed event dates and handles coincident milestones without division by zero", () => {
    const schedule = {
      ...EVENT_DEFAULTS,
      registrationDeadline: "2027-01-01",
      drawDate: "2027-01-01",
      sendDeadline: "2027-01-01",
      receiveDeadline: "2027-01-01",
      finaleDate: "2027-01-01",
    };
    expect(getGarlandDecoration(schedule, now).intensity).toBe(0.55);
    expect(
      getGarlandDecoration(schedule, new Date("2027-01-01T12:00:00Z"))
        .intensity,
    ).toBe(1);
    const daily = Array.from(
      { length: 120 },
      (_, index) =>
        getGarlandDecoration(
          EVENT_DEFAULTS,
          new Date(Date.UTC(2026, 9, 1 + index)),
        ).intensity,
    );
    expect(
      daily.every(
        (value, index) =>
          Number.isFinite(value) &&
          value >= 0.55 &&
          value <= 1 &&
          (!index || value >= daily[index - 1]),
      ),
    ).toBe(true);
  });
});
