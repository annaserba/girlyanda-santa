import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  executeDraw: vi.fn(),
  getEventConfig: vi.fn(),
}));

vi.mock("@/lib/db", async () => ({
  schema: await import("@/lib/db/schema"),
  first: async (query: Promise<unknown[]>) => (await query)[0],
  db: { select: mocks.select, insert: mocks.insert },
}));

vi.mock("@/lib/api", () => ({
  requireAdmin: mocks.requireAdmin,
  badRequest: (error: string) => NextResponse.json({ error }, { status: 400 }),
}));

vi.mock("@/lib/draw-runner", () => ({ executeDraw: mocks.executeDraw }));
vi.mock("@/lib/event-settings", () => ({ getEventConfig: mocks.getEventConfig }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Тайный Санта", ...body }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(null);
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.getEventConfig.mockResolvedValue({ registrationOpen: false, budget: 1000, ringPolicy: "tracks" });
  mocks.from.mockResolvedValue([1, 2, 3].map((id) => ({ id, name: `Человек ${id}`, city: "Уфа", site: "Склад", shift: "", track: "local", pickupPoint: "", wishes: "Чай", consentAt: new Date(), reserveVolunteer: false })));
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 1, allowSelfDraw: false }]);
  mocks.executeDraw.mockResolvedValue({
    draw: { id: 1, allowSelfDraw: false },
    assignments: 3,
    rings: 1,
    historyRelaxed: false,
    revealLinks: [],
  });
});

describe("retired notification channels", () => {
  it("requires closing registration first", async () => {
    mocks.getEventConfig.mockResolvedValue({ registrationOpen: true });
    const response = await POST(request({})); expect(response.status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not include accounts without opt-in profiles", async () => {
    mocks.from.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const response = await POST(request({})); expect(response.status).toBe(400); expect(mocks.executeDraw).not.toHaveBeenCalled();
  });
  it.each(["deliverEmail", "deliverPush"])("rejects enabling %s", async (channel) => {
    const response = await POST(request({ [channel]: true }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Автоматические уведомления отключены. Используйте вкладку «Рассылка» для корпоративной почты.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.executeDraw).not.toHaveBeenCalled();
  });

  it("stores disabled channels and returns no delivery claims", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      deliverEmail: false,
      deliverPush: false,
    }));
    expect(await response.json()).not.toHaveProperty("delivery");
  });

  it("accepts false from older clients", async () => {
    const response = await POST(request({ deliverEmail: false, deliverPush: false }));
    expect(response.status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      deliverEmail: false,
      deliverPush: false,
    }));
  });
});

describe("self-assignment is forbidden through the draw API", () => {
  it("rejects a direct request to enable self-assignment before creating a draw", async () => {
    const response = await POST(request({ allowSelfDraw: true }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Дарить самому себе нельзя." });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.executeDraw).not.toHaveBeenCalled();
  });

  it("stores false when the setting is omitted", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ allowSelfDraw: false }));
    expect(mocks.executeDraw).toHaveBeenCalledWith(expect.objectContaining({ allowSelfDraw: false }));
  });

  it("accepts older clients that explicitly send false", async () => {
    const response = await POST(request({ allowSelfDraw: false }));
    expect(response.status).toBe(201);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ allowSelfDraw: false }));
  });
});
