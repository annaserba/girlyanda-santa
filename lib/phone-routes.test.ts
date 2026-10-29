import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  participant: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));
vi.mock("@/lib/db", async () => ({
  schema: await import("@/lib/db/schema"),
  first: async (query: Promise<unknown[]>) => (await query)[0],
  db: { insert: mocks.insert, update: mocks.update },
}));
vi.mock("@/lib/api", () => ({
  requireAdmin: mocks.requireAdmin,
  badRequest: (error: string) => NextResponse.json({ error }, { status: 400 }),
}));
vi.mock("@/lib/session", () => ({
  getOrCreateParticipant: mocks.participant,
}));

import { PUT as updateOwnPhone } from "@/app/api/me/route";
import { POST as createParticipant } from "@/app/api/participants/route";
import { PUT as updateParticipant } from "@/app/api/participants/[id]/route";

function request(body: object) {
  return new NextRequest("http://localhost/api/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const routes = [
  {
    label: "own phone",
    run: (body: object) => updateOwnPhone(request(body)),
    status: 200,
  },
  {
    label: "new participant",
    run: (body: object) => createParticipant(request(body)),
    status: 201,
  },
  {
    label: "participant update",
    run: (body: object) =>
      updateParticipant(request(body), {
        params: Promise.resolve({ id: "7" }),
      }),
    status: 200,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue(null);
  mocks.participant.mockResolvedValue({ id: 7 });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 7 }]);
});

describe.each(routes)("Russian-only contacts: $label", ({ run, status }) => {
  it.each(["+1 202 555 0100", "+7 701 555 0100", "+7 999 123", "abc"])(
    "rejects %s before any contact write",
    async (phone) => {
      const response = await run({ name: "Участник", phone });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("номер телефона РФ");
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it("stores a normalized Russian number", async () => {
    const response = await run({
      name: "Участник",
      phone: "8 (999) 123-45-67",
    });
    expect(response.status).toBe(status);
    const writer = mocks.values.mock.calls.length ? mocks.values : mocks.set;
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "79991234567" }),
    );
  });
  it("still allows clearing an optional contact", async () => {
    const response = await run({ name: "Участник", phone: null });
    expect(response.status).toBe(status);
    const writer = mocks.values.mock.calls.length ? mocks.values : mocks.set;
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });
});

it("does not modify a stored phone when the organizer only renames a participant", async () => {
  const response = await updateParticipant(request({ name: "Новое имя" }), {
    params: Promise.resolve({ id: "7" }),
  });
  expect(response.status).toBe(200);
  expect(mocks.set).toHaveBeenCalledWith({ name: "Новое имя" });
});

it("keeps organizer routes protected", async () => {
  mocks.requireAdmin.mockResolvedValue(
    NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );
  expect(
    (
      await createParticipant(
        request({ name: "Участник", phone: "79991234567" }),
      )
    ).status,
  ).toBe(403);
  const response = await updateParticipant(request({ phone: "79991234567" }), {
    params: Promise.resolve({ id: "7" }),
  });
  expect(response.status).toBe(403);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("does not allow an anonymous profile update", async () => {
  mocks.participant.mockResolvedValue(null);
  expect((await updateOwnPhone(request({ phone: "79991234567" }))).status).toBe(
    401,
  );
  expect(mocks.update).not.toHaveBeenCalled();
});
