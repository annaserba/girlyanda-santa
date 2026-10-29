import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "@/lib/event-config";
import { summarizeGifts } from "@/lib/garland-summary";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  config: vi.fn(),
  snapshot: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/event-settings", () => ({ getEventConfig: mocks.config }));
vi.mock("@/lib/settings", () => ({ getOgSettings: mocks.settings }));
vi.mock("@/lib/garland-snapshot", () => ({
  getGarlandSnapshot: mocks.snapshot,
}));
import Home from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue(null);
  mocks.settings.mockResolvedValue({
    title: "Тайный Санта",
    description: "Обмен подарками",
    banner: "",
  });
  mocks.config.mockResolvedValue({ ...EVENT_DEFAULTS, mapPublished: true });
  mocks.snapshot.mockResolvedValue({
    phase: "registration",
    summary: summarizeGifts(
      [{ city: "Уфа", site: "Склад", receivedAt: null }],
      EVENT_DEFAULTS,
    ),
  });
});

describe("home map publication", () => {
  it.each([true, false])(
    "places the two gift tracks immediately after the dates, before the map: published=%s",
    async (mapPublished) => {
      mocks.config.mockResolvedValue({ ...EVENT_DEFAULTS, mapPublished });
      const html = renderToStaticMarkup(await Home());
      const dates = html.indexOf('class="festive-dates"');
      const note = html.indexOf('class="festive-calendar-note"');
      const tracks = html.indexOf('class="festive-tracks"');
      const map = html.indexOf('id="garland"');
      const how = html.indexOf('id="how"');
      expect(dates).toBeGreaterThan(-1);
      expect(note).toBeGreaterThan(dates);
      expect(tracks).toBeGreaterThan(note);
      expect(map).toBeGreaterThan(tracks);
      expect(how).toBeGreaterThan(map);
      expect(html.match(/id="tracks-heading"/g)).toHaveLength(1);
      expect(html).toContain("Рядом");
      expect(html).toContain("Через всю страну");
    },
  );
  it("shows the published anonymous map and registration links to guests", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Общая карта гирлянды");
    expect(html).toContain("Москва");
    expect(html).not.toMatch(/Демо|Реальных участников:|Пример отображения/);
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('<h1 id="welcome-heading">Тайный Санта</h1>');
    expect(html).toContain("<span>Тайный Санта</span>");
    expect(html).toContain("<p>Тайный Санта</p>");
    expect(html).toContain('aria-label="Тайный Санта — главная"');
    expect(html).not.toContain("Гирлянда Тайного Санты");
    expect(html).not.toContain('href="/admin"');
  });
  it("does not even query public map data when publication is disabled", async () => {
    mocks.config.mockResolvedValue(EVENT_DEFAULTS);
    const html = renderToStaticMarkup(await Home());
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(html).not.toContain("Склад");
    expect(html).toContain("Карта доступна участникам после входа");
  });
  it("lets signed-in participants view home without redirecting", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    mocks.config.mockResolvedValue(EVENT_DEFAULTS);
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Общая карта гирлянды");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/admin"');
  });
  it("keeps the organizer shortcut for admins", async () => {
    mocks.user.mockResolvedValue({ id: "a1", role: "admin" });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('href="/admin"');
    expect(html).toContain("Общая карта гирлянды");
  });
  it("uses the deck artwork decoratively and keeps the real map separate", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('class="festive-shell"');
    expect(html).toContain('src="/festive/gift-ring.png"');
    expect(html).toContain('class="festive-hero-art" aria-hidden="true"');
    expect(html).toContain('id="garland"');
    expect(html).toContain('href="#garland"');
    expect(html).toContain('id="how"');
    expect(html).toContain("Карта записи участников");
    expect(html).not.toContain("огоньков зажжено");
    expect(html).not.toContain("1500 коллег");
    expect(html).not.toContain("image1.jpg");
    expect(html).not.toContain("🎁");
  });
  it("reads dates and budget from the event settings instead of hardcoding the slide examples", async () => {
    mocks.config.mockResolvedValue({
      ...EVENT_DEFAULTS,
      mapPublished: true,
      budget: 2500,
      drawDate: "2027-01-10",
    });
    const html = renderToStaticMarkup(await Home());
    expect(html.replace(/\u00a0/g, " ")).toContain("2 500");
    expect(html).toMatch(/datetime="2027-01-10"/i);
    expect(html).toContain("10 января");
    expect(html).toContain("Плановые сроки");
  });
  it("returns to factual registration counts once eight participants have opted in", async () => {
    mocks.snapshot.mockResolvedValue({
      phase: "registration",
      summary: summarizeGifts(
        Array.from({ length: 8 }, () => ({
          city: "Уфа",
          site: "Склад",
          receivedAt: null,
        })),
        EVENT_DEFAULTS,
      ),
    });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Склад: записались 8");
    expect(html).not.toMatch(
      /Записались:|Огоньки ещё не зажжены|До жеребьёвки показываем/,
    );
    expect(html).not.toContain("Демонстрационная площадка");
    expect(html).not.toContain("В примере:");
  });
});
