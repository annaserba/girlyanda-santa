import data from "./russian-cities.json";
import { canonical } from "./event-config";
import { findRegistrationCity } from "./registration-cities";

function cityKey(value: string) {
  return canonical(value)
    .replace(/^г(?:ород)?\.?\s+/u, "")
    .replace(/[–—]/g, "-");
}
const index = new Map<string, (typeof data.cities)[number] | null>();
for (const city of data.cities) {
  for (const name of city.names) {
    const key = cityKey(name);
    if (!index.has(key)) index.set(key, city);
    else if (index.get(key)?.id !== city.id) index.set(key, null);
  }
}

/** Approximate city anchors only; never a participant's address or live lookup. */
export function findRussianCity(name: string) {
  const registered = findRegistrationCity(cityKey(name));
  if (registered)
    return {
      city: name,
      latitude: registered.latitude,
      longitude: registered.longitude,
    };
  const city = index.get(cityKey(name));
  if (!city) return null;
  return { city: name, latitude: city.latitude, longitude: city.longitude };
}
