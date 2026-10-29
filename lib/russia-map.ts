import {
  geoConicConformal,
  geoContains,
  geoDistance,
  geoPath,
  type GeoPermissibleObjects,
} from "d3-geo";
import russia from "./russia-50m.json";
import additionalRegions from "./additional-regions.json";

export const RUSSIA_MAP_WIDTH = 1000;
export const RUSSIA_MAP_HEIGHT = 480;
export const RUSSIA_GEOMETRY = russia as GeoPermissibleObjects;
export const ADDITIONAL_REGIONS_GEOMETRY =
  additionalRegions as GeoPermissibleObjects;
export const GARLAND_MAP_GEOMETRY = {
  type: "FeatureCollection",
  features: [russia, ...additionalRegions.features],
} as GeoPermissibleObjects;

/** Same conformal frame for country, cities and decorative ring; no CSS stretch. */
export function createRussiaProjection() {
  return geoConicConformal()
    .parallels([50, 70])
    .rotate([-100, 0])
    .center([0, 60])
    .precision(0.2)
    .fitExtent(
      [
        [32, 22],
        [RUSSIA_MAP_WIDTH - 32, RUSSIA_MAP_HEIGHT - 36],
      ],
      GARLAND_MAP_GEOMETRY,
    );
}

const projection = createRussiaProjection();
export const RUSSIA_OUTLINE = geoPath(projection)(RUSSIA_GEOMETRY) ?? "";
export const ADDITIONAL_REGION_OUTLINES = additionalRegions.features.map(
  (feature) => ({
    id: feature.properties.iso_3166_2,
    name: feature.properties.name,
    path: geoPath(projection)(feature as GeoPermissibleObjects) ?? "",
  }),
);
export type MapPoint = [number, number];
const coastlinePoints = [
  ...russia.geometry.coordinates.flat(2),
  ...additionalRegions.features.flatMap((feature) =>
    feature.geometry.coordinates.flat(2),
  ),
] as MapPoint[];

export function projectRussianLocation(
  location: { longitude: number; latitude: number } | null,
): MapPoint | null {
  if (!location) return null;
  const { longitude, latitude } = location;
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    return null;
  // Coastal town anchors are rounded, and this 1:50m basemap is generalized.
  // A small 8 km tolerance is cartographic, not a citizenship/border validator.
  const coordinate: MapPoint = [longitude, latitude];
  if (
    !geoContains(GARLAND_MAP_GEOMETRY, coordinate) &&
    !coastlinePoints.some((point) => geoDistance(point, coordinate) <= 8 / 6371)
  )
    return null;
  const point = projection([longitude, latitude]);
  if (
    !point ||
    !point.every(Number.isFinite) ||
    point[0] < 0 ||
    point[0] > RUSSIA_MAP_WIDTH ||
    point[1] < 0 ||
    point[1] > RUSSIA_MAP_HEIGHT
  )
    return null;
  return point;
}

/** A schematic city loop only: input has no people, assignments or secret IDs. */
export function buildCityRing(points: readonly MapPoint[]): string {
  const unique = [
    ...new Map(
      points
        .filter((p) => p.every(Number.isFinite))
        .map((point) => [point.map((v) => v.toFixed(3)).join(","), point]),
    ).values(),
  ];
  if (unique.length < 3) return "";
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const center = unique.reduce(
    (sum, point) =>
      [
        sum[0] + point[0] / unique.length,
        sum[1] + point[1] / unique.length,
      ] as MapPoint,
    [0, 0] as MapPoint,
  );
  const sorted = [...unique].sort((a, b) => {
    const angle = (p: MapPoint) =>
      Math.atan2(p[1] - center[1], p[0] - center[0]);
    return angle(a) - angle(b) || a[0] - b[0] || a[1] - b[1];
  });
  const twiceArea = sorted.reduce((area, point, index) => {
    const next = sorted[(index + 1) % sorted.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (Math.abs(twiceArea) < 1) return "";
  // A closed cardinal spline with shared, bounded tangents stays smooth even
  // at its closing point and avoids large overshoots in dense city clusters.
  const tangents = sorted.map((point, index) => {
    const previous = sorted[(index - 1 + sorted.length) % sorted.length];
    const next = sorted[(index + 1) % sorted.length];
    const tangent: MapPoint = [
      (next[0] - previous[0]) / 4,
      (next[1] - previous[1]) / 4,
    ];
    const length = Math.hypot(...tangent);
    const limit = Math.min(
      120,
      Math.hypot(point[0] - previous[0], point[1] - previous[1]) * 0.5,
      Math.hypot(next[0] - point[0], next[1] - point[1]) * 0.5,
    );
    const factor = length ? Math.min(1, limit / length) : 0;
    return tangent.map((value) => value * factor) as MapPoint;
  });
  const format = (point: MapPoint) =>
    point.map((value) => value.toFixed(2)).join(",");
  const segments = sorted.map((point, index) => {
    const nextIndex = (index + 1) % sorted.length;
    const next = sorted[nextIndex];
    const outgoing: MapPoint = [
      point[0] + tangents[index][0],
      point[1] + tangents[index][1],
    ];
    const incoming: MapPoint = [
      next[0] - tangents[nextIndex][0],
      next[1] - tangents[nextIndex][1],
    ];
    return `C${format(outgoing)} ${format(incoming)} ${format(next)}`;
  });
  return `M${format(sorted[0])} ${segments.join(" ")} Z`;
}

/** Hide colliding labels, never their data: factual totals stay screen-reader accessible. */
export function placeCityLabels(
  cities: { city: string; point: MapPoint; total: number }[],
) {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  const labels = new Map<
    string,
    { x: number; y: number; anchor: "start" | "end" }
  >();
  for (const {
    city,
    point: [x, y],
  } of [...cities].sort(
    (a, b) => b.total - a.total || a.city.localeCompare(b.city, "ru"),
  )) {
    const width = city.length * 6.5;
    for (const candidate of [
      { x: x + 12, y: y - 10, anchor: "start" as const },
      { x: x - 12, y: y - 10, anchor: "end" as const },
      { x: x + 12, y: y + 20, anchor: "start" as const },
      { x: x - 12, y: y + 20, anchor: "end" as const },
    ]) {
      const box = {
        x: candidate.anchor === "end" ? candidate.x - width : candidate.x,
        y: candidate.y - 12,
        width,
        height: 16,
      };
      if (
        box.x < 10 ||
        box.x + box.width > RUSSIA_MAP_WIDTH - 10 ||
        box.y < 5 ||
        box.y + box.height > RUSSIA_MAP_HEIGHT - 24
      )
        continue;
      if (
        boxes.some(
          (b) =>
            box.x < b.x + b.width + 4 &&
            box.x + box.width + 4 > b.x &&
            box.y < b.y + b.height &&
            box.y + box.height > b.y,
        )
      )
        continue;
      if (
        cities.some(
          (other) =>
            other.city !== city &&
            other.point[0] > box.x - 7 &&
            other.point[0] < box.x + box.width + 7 &&
            other.point[1] > box.y - 7 &&
            other.point[1] < box.y + box.height + 7,
        )
      )
        continue;
      boxes.push(box);
      labels.set(city, candidate);
      break;
    }
  }
  return labels;
}
