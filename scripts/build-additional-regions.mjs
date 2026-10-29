import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { geoArea } from "d3-geo";

// Regeneration only: the running application uses the checked-in subset offline.
const revision = "ca96624a56bd078437bca8184e78163e5039ad19";
const source = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_10m_admin_1_states_provinces.geojson`;
const expectedSha256 =
  "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5";
const selected = ["UA-14", "UA-09", "UA-23", "UA-65"];
const [output, cachedSource] = process.argv.slice(2);
if (!output)
  throw new Error("Pass an output JSON path and optional source file");

let bytes;
if (cachedSource) bytes = await readFile(cachedSource);
else {
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`Natural Earth download: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
if (sourceSha256 !== expectedSha256)
  throw new Error("Natural Earth source checksum mismatch");
const collection = JSON.parse(bytes.toString("utf8"));
const features = selected.map((id) => {
  const matches = collection.features.filter(
    (feature) => feature.properties.iso_3166_2 === id,
  );
  if (matches.length !== 1)
    throw new Error(`Expected exactly one ${id} feature`);
  const { properties, geometry } = matches[0];
  if (properties.adm0_a3 !== "UKR")
    throw new Error(`Unexpected source classification for ${id}`);
  if (!["Polygon", "MultiPolygon"].includes(geometry.type))
    throw new Error(`Expected polygon geometry for ${id}`);
  const coordinates =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of coordinates) {
    if (geoArea({ type: "Polygon", coordinates: polygon }) > 2 * Math.PI)
      polygon.forEach((ring) => ring.reverse());
  }
  const feature = {
    type: "Feature",
    properties: {
      name: properties.name_ru,
      iso_3166_2: id,
      adm1_code: properties.adm1_code,
      adm0_a3: properties.adm0_a3,
    },
    geometry: { type: "MultiPolygon", coordinates },
  };
  const area = geoArea(feature);
  if (!(area > 0.0001 && area < 0.002))
    throw new Error(`Unexpected spherical area for ${id}: ${area}`);
  return feature;
});
const result = {
  type: "FeatureCollection",
  metadata: {
    source: "Natural Earth",
    sourceUrl: source,
    revision,
    sourceSha256,
    retrieved: "2026-10-29",
    scale: "1:10m",
    license: "public domain",
    coverage: "Administrative regions, not current territorial control",
  },
  features,
};
await writeFile(output, `${JSON.stringify(result)}\n`, { flag: "wx" });
console.log(
  JSON.stringify({
    regions: features.map((f) => f.properties.name),
    sourceSha256,
  }),
);
