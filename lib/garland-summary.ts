import { canonical, type EventConfig } from "./event-config";
export function summarizeGifts(
  rows: { city: string; site: string; receivedAt: Date | string | null }[],
  config: EventConfig,
) {
  const cities = new Map<
    string,
    {
      city: string;
      total: number;
      received: number;
      sites: Map<string, { site: string; total: number; received: number }>;
    }
  >();
  for (const row of rows) {
    const key = canonical(row.city) || "не указан";
    const city = cities.get(key) ?? {
      city: row.city || "Город не указан",
      total: 0,
      received: 0,
      sites: new Map(),
    };
    city.total++;
    if (row.receivedAt) city.received++;
    const siteKey = canonical(row.site);
    const site = city.sites.get(siteKey) ?? {
      site: row.site || "Площадка не указана",
      total: 0,
      received: 0,
    };
    site.total++;
    if (row.receivedAt) site.received++;
    city.sites.set(siteKey, site);
    cities.set(key, city);
  }
  return {
    total: rows.length,
    received: rows.filter((r) => !!r.receivedAt).length,
    cities: [...cities.entries()]
      .map(([key, city]) => ({
        ...city,
        sites: [...city.sites.values()],
        location:
          config.locations.find((l) => canonical(l.city) === key) ?? null,
      }))
      .sort((a, b) => a.city.localeCompare(b.city, "ru")),
  };
}
