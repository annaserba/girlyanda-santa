import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Only regeneration uses the network; the application uses the bundled snapshot.
const revision = "ae661bffe572880472249097c9b29c42b09650ea";
const source =
  "https://raw.githubusercontent.com/hflabs/city/" + revision + "/city.csv";
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok)
  throw new Error("City source download failed: " + response.status);
const text = await response.text();
function csvRows(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (ch === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
const [header, ...rows] = csvRows(text);
const key = (value) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
const cities = rows.map((row) => {
  if (row.length !== header.length) throw new Error("Incomplete CSV row");
  const record = Object.fromEntries(header.map((name, i) => [name, row[i]]));
  if (record.country !== "Россия") throw new Error("Unexpected country");
  const name =
    (record.settlement_type === "г" ? record.settlement : "") ||
    record.city ||
    (record.region_type === "г" ? record.region : "") ||
    record.address.match(/(?:^|,\s*)г\s+([^,]+)$/u)?.[1];
  if (!name)
    throw new Error(
      "City name is missing: " +
        JSON.stringify({
          address: record.address,
          regionType: record.region_type,
          region: record.region,
          settlementType: record.settlement_type,
          settlement: record.settlement,
        }),
    );
  const region =
    record.region_type === "г"
      ? name
      : record.region_type === "Респ"
        ? "Республика " + record.region
        : record.region +
          " " +
          ({
            обл: "область",
            Аобл: "автономная область",
            АО: "автономный округ",
          }[record.region_type] || record.region_type);
  const latitude = Number(record.geo_lat),
    longitude = Number(record.geo_lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new Error("Invalid coordinates: " + name);
  return { name, region, latitude, longitude };
});
const counts = new Map();
for (const city of cities)
  counts.set(key(city.name), (counts.get(key(city.name)) || 0) + 1);
const entries = cities
  .map((city) => ({
    value:
      counts.get(key(city.name)) > 1
        ? city.name + " (" + city.region + ")"
        : city.name,
    label:
      city.name === city.region ? city.name : city.name + " — " + city.region,
    latitude: city.latitude,
    longitude: city.longitude,
  }))
  .sort((a, b) => a.value.localeCompare(b.value, "ru"));
if (entries.length < 1000) throw new Error("Incomplete city catalogue");
const duplicates = entries.filter(
  (city, index) =>
    entries.findIndex((other) => key(other.value) === key(city.value)) !==
    index,
);
if (duplicates.length)
  throw new Error("Ambiguous city catalogue: " + JSON.stringify(duplicates));
if (entries.some((city) => city.value.length > 120))
  throw new Error("City value exceeds profile limit");
const output = process.argv[2];
if (!output) throw new Error("Pass a new output JSON path");
const data = {
  source,
  revision,
  retrieved: new Date().toISOString().slice(0, 10),
  sourceSha256: createHash("sha256").update(text).digest("hex"),
  attribution: "hflabs/city, DaData.ru; adapted city/region/coordinate subset",
  license: "https://creativecommons.org/licenses/by-sa/4.0/",
  cities: entries,
};
await writeFile(output, JSON.stringify(data) + "\n", { flag: "wx" });
console.log(
  JSON.stringify({
    cities: entries.length,
    bytes: JSON.stringify(data).length,
  }),
);
