import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { geoArea, geoContains, geoDistance, geoPath } from "d3-geo";
import {
  buildCityRing,
  createRussiaProjection,
  placeCityLabels,
  projectRussianLocation,
  RUSSIA_GEOMETRY,
  GARLAND_MAP_GEOMETRY,
  ADDITIONAL_REGIONS_GEOMETRY,
  ADDITIONAL_REGION_OUTLINES,
  RUSSIA_OUTLINE,
  RUSSIA_MAP_WIDTH,
  RUSSIA_MAP_HEIGHT,
  type MapPoint,
} from "./russia-map";
import russia from "./russia-50m.json";
import additionalRegions from "./additional-regions.json";
import { getGarlandDisplay } from "./garland-display";
import { EVENT_DEFAULTS } from "./event-config";
import { GarlandMap } from "@/components/garland-map";

const baseCities = () =>
  getGarlandDisplay(
    {
      phase: "registration",
      summary: { total: 0, received: 0, cities: [] },
    },
    EVENT_DEFAULTS,
  ).summary;
describe("offline Russia-only cartographic frame", () => {
  it("bundles only the dated RUS feature with correct spherical winding", () => {
    expect(russia.properties.ADM0_A3).toBe("RUS");
    expect(russia.properties.revision).toBe(
      "ca96624a56bd078437bca8184e78163e5039ad19",
    );
    expect(geoArea(RUSSIA_GEOMETRY)).toBeGreaterThan(0.4);
    expect(geoArea(RUSSIA_GEOMETRY)).toBeLessThan(0.5);
    expect(RUSSIA_OUTLINE).not.toMatch(/NaN|Infinity/);
    expect(RUSSIA_OUTLINE.length).toBeGreaterThan(1000);
  });
  it("fits the entire country with one scale and no planar rotation or clipping", () => {
    const projection = createRussiaProjection();
    const bounds = geoPath(projection).bounds(GARLAND_MAP_GEOMETRY);
    expect(bounds[0][0]).toBeGreaterThanOrEqual(31.99);
    expect(bounds[0][1]).toBeGreaterThanOrEqual(21.99);
    expect(bounds[1][0]).toBeLessThanOrEqual(RUSSIA_MAP_WIDTH - 31.99);
    expect(bounds[1][1]).toBeLessThanOrEqual(RUSSIA_MAP_HEIGHT - 35.99);
    expect(projection.angle()).toBe(0);
    expect(projection.clipExtent()).toBeNull();
  });
  it("keeps all eight base anchors on the map in the same geographic frame", () => {
    const points = new Map(
      baseCities().cities.map((city) => [
        city.city,
        projectRussianLocation(city.location),
      ]),
    );
    expect([...points.values()].every(Boolean)).toBe(true);
    expect(points.get("Москва")![0]).toBeLessThan(
      points.get("Новосибирск")![0],
    );
    expect(points.get("Мурманск")![1]).toBeLessThan(points.get("Москва")![1]);
    expect(points.get("Владивосток")![1]).toBeGreaterThan(
      points.get("Якутск")![1],
    );
  });
  it.each([
    { longitude: 20.51, latitude: 54.71 },
    { longitude: 170, latitude: 66.5 },
    { longitude: 177.5, latitude: 64.73 },
  ])("retains the enclave and far eastern/coastal anchors: %j", (location) => {
    expect(projectRussianLocation(location)).not.toBeNull();
  });
  it("does not split Russia or nearby city anchors at the antimeridian", () => {
    const west = projectRussianLocation({ longitude: 179.9, latitude: 68 });
    const east = projectRussianLocation({ longitude: -179.9, latitude: 68 });
    expect(west).not.toBeNull();
    expect(east).not.toBeNull();
    expect(Math.hypot(west![0] - east![0], west![1] - east![1])).toBeLessThan(
      3,
    );
  });
  it.each([
    null,
    { longitude: NaN, latitude: 55 },
    { longitude: 999, latitude: 55 },
    { longitude: 40, latitude: 91 },
    { longitude: -0.12, latitude: 51.5 },
    { longitude: 71.45, latitude: 51.16 },
  ])(
    "does not manufacture a marker for invalid/outside coordinates: %j",
    (location) => {
      expect(projectRussianLocation(location)).toBeNull();
    },
  );
  it("preserves local shapes rather than applying different horizontal and vertical scales", () => {
    const projection = createRussiaProjection();
    const origin: MapPoint = [82.92, 55.03];
    const north: MapPoint = [82.92, 55.0301];
    const east: MapPoint = [82.9201, 55.03];
    const [x, y] = projection(origin)!;
    const scale = (point: MapPoint) =>
      Math.hypot(projection(point)![0] - x, projection(point)![1] - y) /
      geoDistance(origin, point);
    expect(scale(east) / scale(north)).toBeCloseTo(1, 3);
  });
});

describe("additional administrative region layer", () => {
  it("keeps exactly four sourced regions without duplicating Crimea", () => {
    expect(additionalRegions.metadata.revision).toBe(
      russia.properties.revision,
    );
    expect(additionalRegions.metadata.sourceSha256).toBe(
      "22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5",
    );
    expect(
      additionalRegions.features.map((f) => f.properties.iso_3166_2),
    ).toEqual(["UA-14", "UA-09", "UA-23", "UA-65"]);
    expect(
      additionalRegions.features.every((f) => f.properties.adm0_a3 === "UKR"),
    ).toBe(true);
    expect(geoArea(ADDITIONAL_REGIONS_GEOMETRY)).toBeGreaterThan(0.002);
    expect(geoArea(ADDITIONAL_REGIONS_GEOMETRY)).toBeLessThan(0.004);
    expect(geoContains(RUSSIA_GEOMETRY, [34.1, 44.95])).toBe(true);
    expect(geoContains(ADDITIONAL_REGIONS_GEOMETRY, [34.1, 44.95])).toBe(false);
  });
  it.each([
    { longitude: 37.803, latitude: 48.016 },
    { longitude: 39.308, latitude: 48.574 },
    { longitude: 35.14, latitude: 47.839 },
    { longitude: 32.618, latitude: 46.635 },
  ])("projects a participant in the added region: %j", (location) => {
    expect(
      geoContains(RUSSIA_GEOMETRY, [location.longitude, location.latitude]),
    ).toBe(false);
    const point = projectRussianLocation(location);
    expect(point).not.toBeNull();
    expect(point).toEqual(
      createRussiaProjection()([location.longitude, location.latitude]),
    );
  });
  it.each([
    { longitude: 30.523, latitude: 50.45 },
    { longitude: 24.029, latitude: 49.84 },
    { longitude: 30.733, latitude: 46.483 },
    { longitude: 36.235, latitude: 49.99 },
  ])("does not accidentally add other regions: %j", (location) => {
    expect(projectRussianLocation(location)).toBeNull();
  });
  it("renders four finite paths in the shared frame without adding fictitious city markers", () => {
    expect(ADDITIONAL_REGION_OUTLINES).toHaveLength(4);
    for (const region of ADDITIONAL_REGION_OUTLINES) {
      expect(region.path.length).toBeGreaterThan(100);
      expect(region.path).not.toMatch(/NaN|Infinity/);
    }
    const summary = baseCities();
    const before = structuredClone(summary);
    const html = renderToStaticMarkup(<GarlandMap summary={summary} />);
    expect(html.match(/class="garland-additional-region"/g)).toHaveLength(4);
    expect(html.match(/<circle/g)).toHaveLength(8);
    expect(html).toContain("Херсонская область");
    expect(summary).toEqual(before);
  });
});

describe("schematic closed city garland, not gift assignments", () => {
  it("closes a deterministic loop through every distinct city without mutating inputs", () => {
    const points = baseCities().cities.map(
      (city) => projectRussianLocation(city.location)!,
    );
    const before = structuredClone(points);
    const path = buildCityRing(points);
    expect(path).toMatch(/^M.+ Z$/);
    expect(path.match(/C/g)).toHaveLength(8);
    expect(path).not.toContain("L");
    expect(path).toBe(buildCityRing([...points].reverse()));
    expect(points).toEqual(before);
    expect(path).not.toMatch(/NaN|Infinity/);
  });
  it.each([
    { points: [] },
    { points: [[1, 1]] },
    {
      points: [
        [1, 1],
        [2, 2],
      ],
    },
    {
      points: [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
    },
    {
      points: [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    },
  ])(
    "does not invent loops with fewer than three distinct non-collinear points: $points",
    ({ points }) => {
      expect(buildCityRing(points as MapPoint[])).toBe("");
    },
  );
  it("deduplicates only line vertices, not city counts or site lists", () => {
    const triangle: MapPoint[] = [
      [10, 10],
      [40, 10],
      [20, 30],
    ];
    expect(buildCityRing([...triangle, [10, 10]])).toBe(
      buildCityRing(triangle),
    );
  });
  it("passes through every city and joins cubic segments smoothly, including closure", () => {
    const points = baseCities().cities.map(
      (city) => projectRussianLocation(city.location)!,
    );
    const path = buildCityRing(points);
    const segments = [...path.matchAll(/C([\d., -]+?)(?= C| Z)/g)].map(
      (match) => match[1].split(/[ ,]+/).map(Number),
    );
    expect(segments).toHaveLength(points.length);
    expect(
      new Set(
        segments.map((segment) =>
          segment
            .slice(4)
            .map((value) => value.toFixed(2))
            .join(","),
        ),
      ),
    ).toEqual(
      new Set(
        points.map((point) => point.map((value) => value.toFixed(2)).join(",")),
      ),
    );
    const first = path.match(/^M([\d.-]+),([\d.-]+)/)!;
    expect(segments.at(-1)!.slice(4)).toEqual([
      Number(first[1]),
      Number(first[2]),
    ]);
    for (let index = 0; index < segments.length; index++) {
      const previous =
        segments[(index - 1 + segments.length) % segments.length];
      const current = segments[index];
      const incoming = [previous[4] - previous[2], previous[5] - previous[3]];
      const outgoing = [current[0] - previous[4], current[1] - previous[5]];
      expect(
        Math.hypot(incoming[0] - outgoing[0], incoming[1] - outgoing[1]),
      ).toBeLessThan(0.03);
      expect(Math.hypot(...outgoing)).toBeLessThanOrEqual(120.02);
    }
  });
  it("renders four fixed bulb layers and factual city statuses without a visible caption", () => {
    const summary = baseCities();
    summary.total = 8;
    summary.received = 4;
    summary.cities = summary.cities.map((city, index) => ({
      ...city,
      total: 1,
      received: index < 4 ? 1 : 0,
      sites: [{ site: "Офис", total: 1, received: index < 4 ? 1 : 0 }],
    }));
    const before = structuredClone(summary);
    const html = renderToStaticMarkup(
      <GarlandMap summary={summary} ringIntensity={0.65} />,
    );
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(html).toContain('viewBox="0 0 1000 480"');
    expect(html.match(/class="garland-ring-lights"/g)).toHaveLength(4);
    expect(html.match(/<circle/g)).toHaveLength(8);
    expect(html.match(/fill="#fbbf24"/g)).toHaveLength(4);
    expect(html.match(/fill="#64748b"/g)).toHaveLength(4);
    expect(html).not.toContain('class="garland-ring-caption"');
    expect(html).toContain('opacity="0.65"');
    expect(html).toContain("не тайные пары");
    expect(html).not.toMatch(/<animate|<script|src=|href="https?:\/\//);
    expect(summary).toEqual(before);
  });
  it("uses visibly rounded arcs rather than straight chords for a circular ring", () => {
    const path = buildCityRing([
      [100, 0],
      [200, 100],
      [100, 200],
      [0, 100],
    ]);
    const first = path.match(/^M([\d.-]+),([\d.-]+)/)!;
    const p = path
      .match(/C([\d., -]+?)(?= C| Z)/)![1]
      .split(/[ ,]+/)
      .map(Number);
    const start = [Number(first[1]), Number(first[2])];
    const midpoint = [0, 1].map(
      (axis) => (start[axis] + 3 * p[axis] + 3 * p[axis + 2] + p[axis + 4]) / 8,
    );
    const chordMidpoint = [0, 1].map((axis) => (start[axis] + p[axis + 4]) / 2);
    expect(
      Math.hypot(
        midpoint[0] - chordMidpoint[0],
        midpoint[1] - chordMidpoint[1],
      ),
    ).toBeGreaterThan(25);
    expect(Math.hypot(midpoint[0] - 100, midpoint[1] - 100)).toBeGreaterThan(
      95,
    );
  });
  it("keeps outside/unknown cities in the accessible list without secret or invented coordinates", () => {
    const summary = {
      total: 1,
      received: 0,
      cities: [
        {
          city: "Вне карты",
          total: 1,
          received: 0,
          sites: [{ site: "Площадка", total: 1, received: 0 }],
          location: { city: "Вне карты", longitude: -0.12, latitude: 51.5 },
        },
      ],
    };
    const html = renderToStaticMarkup(<GarlandMap summary={summary} />);
    expect(html).toContain("Вне карты");
    expect(html).toContain("Площадка: получено 0 из 1");
    expect(html).not.toContain("<circle");
    expect(html).not.toContain('class="garland-city-ring"');
  });
  it("declutters colliding labels without changing the source city list", () => {
    const cities = [
      { city: "Город один", total: 2, point: [400, 300] as MapPoint },
      { city: "Город два", total: 1, point: [402, 301] as MapPoint },
      { city: "Город три", total: 1, point: [404, 302] as MapPoint },
    ];
    const before = structuredClone(cities);
    const labels = placeCityLabels(cities);
    expect(labels.size).toBeGreaterThan(0);
    expect(labels.get("Город один")).toBeDefined();
    expect(cities).toEqual(before);
  });
});
