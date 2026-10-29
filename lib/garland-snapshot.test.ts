import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { EVENT_DEFAULTS } from "./event-config";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  registrationWhere: vi.fn(),
  giftsWhere: vi.fn(),
  drawLimit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => ({
  db: { select: mocks.select },
  schema: await import("@/lib/db/schema"),
  first: async (query: Promise<unknown[]>) => (await query)[0],
}));
import { schema } from "@/lib/db";
import { getGarlandSnapshot } from "./garland-snapshot";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table) => {
    if (table === schema.draw)
      return { where: () => ({ orderBy: () => ({ limit: mocks.drawLimit }) }) };
    if (table === schema.participant) return { where: mocks.registrationWhere };
    if (table === schema.assignment)
      return { innerJoin: () => ({ where: mocks.giftsWhere }) };
    throw new Error("Unexpected public map query");
  });
  mocks.drawLimit.mockResolvedValue([]);
  mocks.registrationWhere.mockResolvedValue([]);
});

describe("shared public map snapshot", () => {
  it("selects only opted-in registration locations and never returns private fields", async () => {
    mocks.registrationWhere.mockResolvedValue([
      {
        city: "Уфа",
        site: "Склад",
        name: "PRIVATE NAME",
        email: "private@example.test",
        receivedAt: new Date(),
        revealToken: "PRIVATE TOKEN",
      },
    ]);
    const result = await getGarlandSnapshot(EVENT_DEFAULTS);
    expect(result.phase).toBe("registration");
    expect(result.summary.total).toBe(1);
    expect(result.summary.received).toBe(0);
    expect(Object.keys(mocks.select.mock.calls[1][0])).toEqual([
      "city",
      "site",
    ]);
    const where = mocks.registrationWhere.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(where).sql).toMatch(
      /"consent_at" is not null/,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|private@example|revealToken|receivedAt/,
    );
    expect(mocks.giftsWhere).not.toHaveBeenCalled();
  });
  it("uses fixed assignments after the draw, not later registrations", async () => {
    mocks.drawLimit.mockResolvedValue([{ id: 9 }]);
    mocks.giftsWhere.mockResolvedValue([
      {
        city: "Уфа",
        site: "Склад",
        receivedAt: new Date(),
        giverId: 12,
        receiverId: 34,
      },
      { city: "Уфа", site: "Склад", receivedAt: null },
    ]);
    const result = await getGarlandSnapshot(EVENT_DEFAULTS);
    expect(result.phase).toBe("gifts");
    expect(result.summary).toMatchObject({ total: 2, received: 1 });
    expect(Object.keys(mocks.select.mock.calls[1][0])).toEqual([
      "city",
      "site",
      "receivedAt",
    ]);
    expect(mocks.registrationWhere).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/giverId|receiverId|drawId/);
  });
  it("does not disguise a database failure as an empty map", async () => {
    mocks.registrationWhere.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(getGarlandSnapshot(EVENT_DEFAULTS)).rejects.toThrow(
      "database unavailable",
    );
  });
});
