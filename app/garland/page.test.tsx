import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "@/lib/event-config";
import { summarizeGifts } from "@/lib/garland-summary";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  config: vi.fn(),
  settings: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("redirect:" + path);
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/event-settings", () => ({ getEventConfig: mocks.config }));
vi.mock("@/lib/settings", () => ({ getOgSettings: mocks.settings }));
vi.mock("@/lib/admin-garland-snapshot", () => ({
  getAdminGarlandSnapshot: mocks.snapshot,
}));
import GarlandPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "a1", role: "admin" });
  mocks.config.mockResolvedValue(EVENT_DEFAULTS);
  mocks.settings.mockResolvedValue({ title: "Наша гирлянда" });
  mocks.snapshot.mockResolvedValue({
    phase: "registration",
    people: [
      {
        id: 1,
        name: "Иванова Анна",
        city: "Уфа",
        site: "Склад",
        shift: "",
        track: "local",
      },
    ],
    gifts: [],
    summary: summarizeGifts(
      [{ city: "Уфа", site: "Склад", receivedAt: null }],
      EVENT_DEFAULTS,
    ),
  });
});
describe("administrator-only personal garland page", () => {
  it("redirects guests before reading any configuration or personal data", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(GarlandPage()).rejects.toThrow("redirect:/login");
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it.each(["user", "coordinator", null])(
    "denies the %s role even when the public map is published",
    async (role) => {
      mocks.user.mockResolvedValue({ id: "u1", role });
      mocks.config.mockResolvedValue({ ...EVENT_DEFAULTS, mapPublished: true });
      await expect(GarlandPage()).rejects.toThrow("redirect:/dashboard");
      expect(mocks.snapshot).not.toHaveBeenCalled();
      expect(mocks.config).not.toHaveBeenCalled();
    },
  );
  it.each([true, false])(
    "shows personal participant details to admins: publication=%s",
    async (mapPublished) => {
      mocks.config.mockResolvedValue({ ...EVENT_DEFAULTS, mapPublished });
      const html = renderToStaticMarkup(await GarlandPage());
      expect(html).toContain("Карта организатора");
      expect(html).toContain("Иванова Анна");
      expect(html).toContain("Наша гирлянда");
      expect(html).toContain('data-admin-city="Уфа"');
      expect(html).toContain("ФИО или площадка");
      expect(mocks.snapshot).toHaveBeenCalledOnce();
    },
  );
});
