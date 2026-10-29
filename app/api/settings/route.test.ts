import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  requireAdmin: mocks.requireAdmin,
  badRequest: (error: string) => NextResponse.json({ error }, { status: 400 }),
}));
vi.mock("@/lib/settings", () => ({
  getOgSettings: mocks.get,
  setOgSettings: mocks.set,
}));
import { PUT } from "./route";

function request(body: unknown) {
  return new NextRequest("http://test.internal/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(null);
  mocks.get.mockResolvedValue({
    title: "Гирлянда",
    description: "Подарки",
    banner: "",
  });
});
describe("appearance settings without editable icon URLs", () => {
  it("saves text and banner settings as before", async () => {
    const body = { title: "Гирлянда", description: "Подарки", banner: "" };
    expect((await PUT(request(body))).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(body);
  });
  it("does not accept a remote icon override", async () => {
    expect(
      (await PUT(request({ icon: "https://example.invalid/icon.png" }))).status,
    ).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("still protects appearance updates with administrator permissions", async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    expect((await PUT(request({ title: "Изменение" }))).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("returns a validation error for malformed JSON instead of throwing", async () => {
    const req = new NextRequest("http://test.internal/api/settings", {
      method: "PUT",
      body: "{",
    });
    expect((await PUT(req)).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
