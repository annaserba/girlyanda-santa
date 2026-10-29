import { writeFile } from "node:fs/promises";
import { geoArea } from "d3-geo";

// Offline application asset. Regeneration alone uses the network.
const revision = "ca96624a56bd078437bca8184e78163e5039ad19";
const source = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_50m_admin_0_countries.geojson`;
const response = await fetch(source);
if (!response.ok) throw new Error(`Natural Earth download: ${response.status}`);
const collection = await response.json();
const matches = collection.features.filter(
  (feature) => feature.properties.ADM0_A3 === "RUS",
);
if (matches.length !== 1) throw new Error("Expected exactly one RUS feature");
const geometry = matches[0].geometry;
if (geometry.type !== "MultiPolygon") throw new Error("Expected MultiPolygon");
// D3 spherical polygons use clockwise outer rings; avoid filling the whole world.
for (const coordinates of geometry.coordinates) {
  if (geoArea({ type: "Polygon", coordinates }) > 2 * Math.PI)
    coordinates.forEach((ring) => ring.reverse());
}
const feature = {
  type: "Feature",
  properties: {
    source: "Natural Earth",
    revision,
    ADM0_A3: "RUS",
    license: "public domain",
  },
  geometry,
};
const area = geoArea(feature);
if (!(area > 0.3 && area < 0.6))
  throw new Error(`Unexpected spherical area: ${area}`);
const output = process.argv[2];
if (!output) throw new Error("Pass an output JSON path");
await writeFile(output, `${JSON.stringify(feature)}\n`, { flag: "wx" });
console.log(
  JSON.stringify({
    source,
    area,
    polygons: geometry.coordinates.length,
    bytes: JSON.stringify(feature).length,
  }),
);
