import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GarlandMap } from "@/components/garland-map";
import { summarizeGifts } from "./garland-summary";
import { EVENT_DEFAULTS } from "./event-config";
import { geoArea, type GeoPermissibleObjects } from "d3-geo";
import russia from "./russia-50m.json";

describe("offline map rendering", () => {
  it("uses land geometry with the correct spherical winding, not an inverted ocean fill", () => {
    const area = geoArea(russia as GeoPermissibleObjects);
    expect(area).toBeGreaterThan(0.3);
    expect(area).toBeLessThan(0.6);
  });
  it("renders local coastlines and real configured coordinates without external resources", () => {
    const summary = summarizeGifts(
      [{ city: "Уфа", site: "Склад", receivedAt: new Date() }],
      {
        ...EVENT_DEFAULTS,
        locations: [{ city: "Уфа", latitude: 54.7, longitude: 55.9 }],
      },
    );
    const html = renderToStaticMarkup(<GarlandMap summary={summary} />);
    expect(html).toContain("Склад: получено 1 из 1");
    expect(html).toContain("<path");
    expect(html).toContain("<circle");
    expect(html).toContain("Склад");
    expect(html).not.toMatch(/NaN|Infinity|<script|src=|href="https?:\/\//);
  });
  it("retains unlocated cities in counts and the accessible list without inventing markers", () => {
    const summary = summarizeGifts(
      [{ city: "Неизвестный город", site: "Офис", receivedAt: null }],
      EVENT_DEFAULTS,
    );
    const html = renderToStaticMarkup(<GarlandMap summary={summary} />);
    expect(html).toContain("Офис: получено 0 из 1");
    expect(html).toContain("Координаты ещё не добавлены");
    expect(html).not.toContain("<circle");
  });
  it("shows confirmed registrations without suggesting gifts were received or pairs drawn", () => {
    const summary = summarizeGifts(
      [{ city: "Уфа", site: "Склад", receivedAt: null }],
      {
        ...EVENT_DEFAULTS,
        locations: [{ city: "Уфа", latitude: 54.7, longitude: 55.9 }],
      },
    );
    const html = renderToStaticMarkup(
      <GarlandMap summary={summary} phase="registration" />,
    );
    expect(html).toContain("Склад: записались 1");
    expect(html).toContain('fill="#64748b"');
    expect(html).not.toContain('fill="#fbbf24"');
    expect(html).not.toContain("получено 0 из 1");
  });
  it("omits the removed legend and empty-state copy", () => {
    const html = renderToStaticMarkup(
      <GarlandMap
        summary={summarizeGifts([], EVENT_DEFAULTS)}
        phase="registration"
      />,
    );
    expect(html).not.toMatch(
      /Жёлтая точка:|Схема Евразии|Natural Earth|Пока нет подтверждённых анкет|Демонстрационные участники не подставляются|Записались:|Огоньки ещё не зажжены|До жеребьёвки показываем/,
    );
    expect(html).not.toContain("<circle");
  });
  it.each([{ phase: "registration" as const }, { phase: "gifts" as const }])(
    "omits the top counter and explanatory copy for $phase",
    ({ phase }) => {
      const summary = summarizeGifts(
        [{ city: "Уфа", site: "Склад", receivedAt: null }],
        EVENT_DEFAULTS,
      );
      const html = renderToStaticMarkup(
        <GarlandMap summary={summary} phase={phase} />,
      );
      expect(html).not.toMatch(
        /garland-map-count|Записались:|Огоньки ещё не зажжены|огоньков зажжено|В примере:|До жеребьёвки показываем|Огонёк загорается только/,
      );
      expect(html).toContain(
        phase === "registration"
          ? "Склад: записались 1"
          : "Склад: получено 0 из 1",
      );
      expect(html).toContain('role="img"');
    },
  );
  it("labels city markers directly without numbered city headings", () => {
    const summary = summarizeGifts(
      [{ city: "Уфа", site: "Склад", receivedAt: null }],
      {
        ...EVENT_DEFAULTS,
        locations: [{ city: "Уфа", latitude: 54.7, longitude: 55.9 }],
      },
    );
    const html = renderToStaticMarkup(<GarlandMap summary={summary} />);
    expect(html).toContain(">Уфа</text>");
    expect(html).not.toContain("1. Уфа");
    expect(html).not.toContain("<ol");
  });
});
