import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "./event-config";
import { summarizeGifts } from "./garland-summary";
vi.mock("next/navigation", () => ({
  useRouter: () => {
    throw new Error("The map must not mount an automatic refresh client");
  },
}));
import { GarlandOverview } from "@/components/garland-overview";

describe("clean map without demo labels or visible city cards", () => {
  it("retains factual data for screen readers, without the visible card grid", () => {
    const summary = summarizeGifts(
      Array.from({ length: 8 }, (_, i) => ({
        city: "Уфа",
        site: "Склад",
        receivedAt: i === 0 ? new Date() : null,
      })),
      EVENT_DEFAULTS,
    );
    const html = renderToStaticMarkup(
      <GarlandOverview
        snapshot={{ phase: "gifts", summary }}
        config={EVENT_DEFAULTS}
      />,
    );
    expect(html).toContain("Общая карта гирлянды");
    expect(html).toContain("Склад: получено 1 из 8");
    expect(html).toContain(
      'class="sr-only" aria-label="Подтверждённые данные по городам"',
    );
    expect(html).not.toMatch(
      /garland-map-city rounded|sm:grid-cols-2|огоньков зажжено|Реальных участников:|Демо|демонстрацион|Пример отображения|Снимок на|каждые 30 секунд/,
    );
  });
  it("shows eight unfilled geographic anchors when nobody is registered, without claiming gifts", () => {
    const summary = summarizeGifts([], EVENT_DEFAULTS);
    const html = renderToStaticMarkup(
      <GarlandOverview
        snapshot={{ phase: "registration", summary }}
        config={EVENT_DEFAULTS}
      />,
    );
    expect(html.match(/<circle/g)).toHaveLength(8);
    expect(html).not.toContain('fill="#fbbf24"');
    expect(html).not.toContain('fill="#64748b"');
    expect(html).toContain("Москва");
    expect(html).toContain(">Уфа</text>");
    expect(html).not.toContain("Краснодар");
    expect(html).toContain("Карта записи участников");
    expect(html).not.toMatch(
      /Демо|Демонстрацион|Пример|Реальных участников|получено 1 из 1|NaN|Infinity|<script|src=|href="https?:\/\//,
    );
  });
  it("threads a new participant city into the same closed garland on the next page render", () => {
    const summary = summarizeGifts(
      [{ city: "Тюмень", site: "Офис", receivedAt: null }],
      EVENT_DEFAULTS,
    );
    const html = renderToStaticMarkup(
      <GarlandOverview
        snapshot={{ phase: "registration", summary }}
        config={EVENT_DEFAULTS}
      />,
    );
    expect(html.match(/<circle/g)).toHaveLength(9);
    expect(html).toContain(">Тюмень</text>");
    const ring = html.match(
      /class="garland-city-ring"[^]*?<path d="([^"]+)"/,
    )![1];
    expect(ring.match(/C/g)).toHaveLength(9);
    expect(ring).not.toContain("L");
    expect(html).toContain("Тюмень: записались 1");
    expect(html).not.toContain("Координаты ещё не добавлены");
  });
  it("keeps actual cities and sites even with fewer than eight people", () => {
    const summary = summarizeGifts(
      Array.from({ length: 7 }, () => ({
        city: "Реальный город",
        site: "Настоящая площадка",
        receivedAt: null,
      })),
      EVENT_DEFAULTS,
    );
    const html = renderToStaticMarkup(
      <GarlandOverview
        snapshot={{ phase: "registration", summary }}
        config={EVENT_DEFAULTS}
      />,
    );
    expect(html).toContain("Настоящая площадка: записались 7");
    expect(html).toContain("Реальный город");
    expect(html).not.toContain("Демонстрационная площадка");
  });
});
