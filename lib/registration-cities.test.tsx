import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  REGISTRATION_CITY_OPTIONS,
  findRegistrationCity,
  searchRegistrationCities,
} from "./registration-cities";
import { registrationCitySchema } from "./registration-city-schema";
import { findRussianCity } from "./russian-cities";
import { CitySelect } from "@/components/city-select";
import { ParticipationForm } from "@/components/participation-form";
import type { Participant } from "@/lib/db/schema";
import catalogue from "../public/data/registration-cities.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("offline Russian city selection at registration", () => {
  it("provides a non-empty, uniquely valued local catalogue, not only base map cities", () => {
    expect(REGISTRATION_CITY_OPTIONS.length).toBe(1117);
    expect(
      new Set(REGISTRATION_CITY_OPTIONS.map((city) => city.value)).size,
    ).toBe(REGISTRATION_CITY_OPTIONS.length);
    for (const city of [
      "Москва",
      "Санкт-Петербург",
      "Уфа",
      "Тюмень",
      "Воскресенск",
      "Владивосток",
    ]) {
      expect(
        REGISTRATION_CITY_OPTIONS.some((option) => option.value === city),
      ).toBe(true);
    }
    expect(
      REGISTRATION_CITY_OPTIONS.every((city) => city.value.length <= 120),
    ).toBe(true);
    expect(catalogue.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(catalogue.license).toBe(
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
  });
  it.each(["", "Мирный", "Лондон", "Астана", "Новый вымышленный город"])(
    "does not accept an arbitrary city: %s",
    (value) => {
      expect(registrationCitySchema.safeParse(value).success).toBe(false);
    },
  );
  it("normalizes a valid choice without accepting aliases of ambiguous cities", () => {
    expect(registrationCitySchema.parse("  уфа ")).toBe("Уфа");
    expect(registrationCitySchema.parse("орел")).toBe(
      findRegistrationCity("Орёл")!.value,
    );
    expect(findRegistrationCity("Мирный")).toBeNull();
  });
  it("distinguishes identical city names by region and resolves each map anchor offline", () => {
    const west = "Мирный (Архангельская область)";
    const east = "Мирный (Республика Саха /Якутия/)";
    expect(findRegistrationCity(west)?.value).not.toBe(
      findRegistrationCity(east)?.value,
    );
    expect(findRussianCity(west)?.longitude).toBeLessThan(50);
    expect(findRussianCity(east)?.longitude).toBeGreaterThan(100);
  });
  it("returns copies rather than mutable shared city records", () => {
    const first = findRegistrationCity("Уфа")!;
    first.value = "Другое";
    first.latitude = 999;
    expect(findRegistrationCity("Уфа")).toMatchObject({ value: "Уфа" });
    expect(findRegistrationCity("Уфа")?.latitude).not.toBe(999);
  });
  it("renders a required custom combobox without a preset city", () => {
    const html = renderToStaticMarkup(
      <CitySelect value="" onChange={vi.fn()} />,
    );
    const trigger = html.match(/<button[^>]*id="city"[^>]*>/)?.[0];
    expect(trigger).toContain('role="combobox"');
    expect(trigger).toContain('aria-required="true"');
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('type="button"');
    expect(html).toContain("Выберите город РФ");
    expect(html).toContain('<input type="hidden" name="city" value=""');
    expect(html).not.toContain("<select");
    expect(html).not.toMatch(/<script|<iframe|(?:src|href)="https?:\/\//);
  });
  it("shows the selected value and respects form busy state", () => {
    const html = renderToStaticMarkup(
      <CitySelect value="Уфа" onChange={vi.fn()} disabled />,
    );
    expect(html.match(/<button[^>]*id="city"[^>]*>/)?.[0]).toContain(
      'disabled=""',
    );
    expect(html).toContain("Уфа — Республика Башкортостан");
    expect(html.match(/<input type="hidden"[^>]*>/)?.[0]).toContain(
      'value="Уфа"',
    );
  });
  it("searches city names regardless of case, whitespace or the е/ё spelling", () => {
    expect(searchRegistrationCities("  ОРЕЛ  ")[0].value).toBe("Орёл");
    expect(searchRegistrationCities("санкт петербург")[0].value).toBe(
      "Санкт-Петербург",
    );
    expect(searchRegistrationCities("Омск")[0].value).toBe("Омск");
  });
  it("searches regions and city names together in either order", () => {
    const values = searchRegistrationCities("башкортостан уф").map(
      (city) => city.value,
    );
    expect(values).toContain("Уфа");
    expect(
      searchRegistrationCities("уф башкортостан").map((city) => city.value),
    ).toEqual(values);
  });
  it("finds homonymous cities with their regions and returns no fabricated results", () => {
    const values = searchRegistrationCities("Мирный").map((city) => city.value);
    expect(values).toContain("Мирный (Архангельская область)");
    expect(values).toContain("Мирный (Республика Саха /Якутия/)");
    expect(searchRegistrationCities("Город которого нет")).toEqual([]);
    expect(searchRegistrationCities("  ")).toHaveLength(
      REGISTRATION_CITY_OPTIONS.length,
    );
  });
  it("preserves a previously saved city even when it is absent from the catalogue", () => {
    const html = renderToStaticMarkup(
      <CitySelect value="Посёлок из старой анкеты" onChange={vi.fn()} />,
    );
    expect(html).toContain("Посёлок из старой анкеты");
    expect(html.match(/<input type="hidden"[^>]*>/)?.[0]).toContain(
      'value="Посёлок из старой анкеты"',
    );
  });
  it.each([false, true])(
    "uses the same city selector in the participation form: locked=%s",
    (locked) => {
      const participant = {
        city: "Уфа",
        site: "Офис",
        shift: "",
        track: "local",
        wishes: "Книга",
        consentAt: null,
        pickupPoint: "",
        reserveVolunteer: false,
      } as Participant;
      const html = renderToStaticMarkup(
        <ParticipationForm participant={participant} locked={locked} open />,
      );
      const trigger = html.match(/<button[^>]*id="profile-city"[^>]*>/)?.[0];
      expect(trigger).toContain('role="combobox"');
      expect(trigger?.includes('disabled=""')).toBe(locked);
      const field = html.match(
        /<input type="hidden"[^>]*name="city"[^>]*>/,
      )?.[0];
      expect(field).toContain('value="Уфа"');
      expect(field?.includes('disabled=""')).toBe(locked);
      expect(html).toContain('for="profile-city"');
      const cityPosition = html.indexOf('id="profile-city"');
      const trackPosition = html.indexOf('id="profile-track"');
      const sitePosition = html.indexOf('name="site"');
      const shiftPosition = html.indexOf('name="shift"');
      expect(trackPosition).toBeGreaterThan(cityPosition);
      expect(sitePosition).toBeGreaterThan(trackPosition);
      expect(shiftPosition).toBeGreaterThan(sitePosition);
      expect(html).not.toContain("Площадка (необязательно)");
      expect(html.match(/<input[^>]*name="site"[^>]*>/)?.[0]).toContain(
        "required",
      );
    },
  );
  it("leaves the site optional for the intercity track", () => {
    const participant = {
      city: "Уфа",
      site: "",
      shift: "",
      track: "country",
      wishes: "Книга",
      consentAt: null,
      pickupPoint: "ПВЗ 15",
      reserveVolunteer: false,
    } as Participant;
    const html = renderToStaticMarkup(
      <ParticipationForm participant={participant} locked={false} open />,
    );
    expect(html).toContain("Площадка (необязательно)");
    expect(html.match(/<input[^>]*name="site"[^>]*>/)?.[0]).not.toContain(
      "required",
    );
    expect(html.match(/<input[^>]*name="pickupPoint"[^>]*>/)?.[0]).toContain(
      "required",
    );
  });
});
