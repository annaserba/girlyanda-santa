import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Draw } from "@/lib/db/schema";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  execute: vi.fn(),
  getEventConfig: vi.fn(),
  locked: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const tx = {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    execute: mocks.execute,
  };
  return {
    schema: await import("@/lib/db/schema"),
    db: {
      ...tx,
      transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(tx),
    },
  };
});
vi.mock("@/lib/event-settings", () => ({
  getEventConfig: mocks.getEventConfig,
}));
import { schema } from "@/lib/db";
import { executeDraw } from "./draw-runner";
const legacyDraw: Draw = {
  id: 7,
  name: "Запланированная жеребьёвка",
  budget: 1000,
  garlandVersion: 1,
  deliveryMode: "reveal",
  deliverReveal: true,
  deliverWhatsapp: false,
  deliverEmail: true,
  deliverPush: true,
  previewLimit: 3,
  allowSelfDraw: false,
  historyDepth: 0,
  ringPolicy: "tracks",
  status: "draft",
  scheduledAt: new Date("2026-11-17T09:00:00Z"),
  executedAt: null,
  pairsVisibleAt: null,
  createdAt: new Date(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No outbound requests allowed");
    }),
  );
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://santa.internal");
  mocks.getEventConfig.mockResolvedValue({ registrationOpen: false });
  mocks.locked.mockResolvedValue([legacyDraw]);
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table) => {
    if (table === schema.draw)
      return { where: () => ({ for: mocks.locked, limit: async () => [] }) };
    if (table === schema.participant)
      return Promise.resolve(
        [1, 2, 3].map((id) => ({
          id,
          name: `Тестовый Участник-${id}`,
          userId: `u${id}`,
          city: "Уфа",
          site: "Склад",
          shift: "",
          track: "local",
          pickupPoint: "",
          wishes: "Чай",
          reserveVolunteer: false,
          consentAt: new Date(),
        })),
      );
    if (table === schema.exclusion) return Promise.resolve([]);
    throw new Error("Unexpected table query");
  });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockResolvedValue(undefined);
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ ...legacyDraw, status: "completed" }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("atomic draw execution without external delivery", () => {
  it("ignores enabled notification flags on older scheduled draws", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://santa-server.example.test");
    const result = await executeDraw(legacyDraw);
    expect(result.assignments).toBe(3);
    expect(result.draw.status).toBe("completed");
    expect(result).not.toHaveProperty("delivery");
    expect(result.rings).toBe(1);
    expect(result.revealLinks).toHaveLength(3);
    expect(
      result.revealLinks.every((link) =>
        link.url.startsWith("https://santa-server.example.test/reveal/"),
      ),
    ).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        deliverEmail: false,
        deliverPush: false,
      }),
    );
  });
  it("refuses an already completed draw after taking the row lock", async () => {
    mocks.locked.mockResolvedValue([{ ...legacyDraw, status: "completed" }]);
    await expect(executeDraw(legacyDraw)).rejects.toThrow("уже выполнена");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not assign gifts while registration is open", async () => {
    mocks.getEventConfig.mockResolvedValue({ registrationOpen: true });
    await expect(executeDraw(legacyDraw)).rejects.toThrow("закройте");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not persist partial results when a track group is too small", async () => {
    mocks.from.mockImplementation((table) =>
      table === schema.draw
        ? { where: () => ({ for: mocks.locked, limit: async () => [] }) }
        : Promise.resolve([]),
    );
    await expect(executeDraw(legacyDraw)).rejects.toThrow("Нет подтверждённых");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
