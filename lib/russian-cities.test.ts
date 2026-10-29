import { describe, expect, it } from "vitest";
import { findRussianCity } from "./russian-cities";
import data from "./russian-cities.json";

describe("offline city lookup without guessed or external coordinates", () => {
  it.each(["Тюмень", "Казань", "Омск", "Санкт-Петербург", "Уфа"])(
    "locates %s locally",
    (name) => {
      const city = findRussianCity(name);
      expect(city).not.toBeNull();
      expect(city?.latitude).toBeGreaterThan(40);
      expect(city?.longitude).toBeGreaterThan(20);
    },
  );
  it("normalizes case, spaces, city prefixes and ё without changing stored data", () => {
    expect(findRussianCity("  г. тЮмЕнь  ")).toMatchObject({
      latitude: findRussianCity("Тюмень")?.latitude,
    });
    expect(findRussianCity("Орёл")?.latitude).toBe(
      findRussianCity("Орел")?.latitude,
    );
  });
  it.each(["", "Неизвестный город", "Лондон", "Москва<script>", "Мирный"])(
    "does not guess unknown or ambiguous name %s",
    (name) => {
      expect(findRussianCity(name)).toBeNull();
    },
  );
  it("bundles finite coordinates, a source checksum and reusable attribution", () => {
    expect(data.cities.length).toBeGreaterThan(1000);
    expect(data.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(data.license).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(
      data.cities.every(
        (city) =>
          Number.isFinite(city.latitude) && Number.isFinite(city.longitude),
      ),
    ).toBe(true);
  });
  it("does not share mutable coordinates between requests", () => {
    const first = findRussianCity("Тюмень")!;
    first.latitude = 999;
    expect(findRussianCity("Тюмень")?.latitude).not.toBe(999);
  });
});
