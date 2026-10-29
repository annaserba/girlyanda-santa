import data from "../public/data/registration-cities.json";

function cityKey(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}

/** A dated, offline city list; duplicate city names include their region. */
export const REGISTRATION_CITY_OPTIONS = data.cities.map(
  ({ value, label }) => ({ value, label }),
);
const byValue = new Map(data.cities.map((city) => [cityKey(city.value), city]));
const searchIndex = REGISTRATION_CITY_OPTIONS.map((city) => ({
  city,
  name: cityKey(city.value),
  text: cityKey(city.label),
}));

/** Search all local cities and regions; exact names and prefixes come first. */
export function searchRegistrationCities(query: string) {
  const normalized = cityKey(query);
  const terms = normalized.split(" ").filter(Boolean);
  if (!terms.length) return [...REGISTRATION_CITY_OPTIONS];
  return searchIndex
    .filter(({ text }) => terms.every((term) => text.includes(term)))
    .sort(
      (a, b) =>
        Number(b.name === normalized) - Number(a.name === normalized) ||
        Number(b.name.startsWith(normalized)) -
          Number(a.name.startsWith(normalized)),
    )
    .map(({ city }) => city);
}

export function findRegistrationCity(value: string) {
  const city = byValue.get(cityKey(value));
  return city ? { ...city } : null;
}
