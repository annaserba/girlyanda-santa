import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  signUpEmail: vi.fn(),
}));

vi.mock("@/lib/db", async () => ({
  schema: await import("@/lib/db/schema"),
  first: async (query: Promise<unknown[]>) => (await query)[0],
  db: {
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { signUpEmail: mocks.signUpEmail } },
}));

import { POST } from "./route";

const registration = {
  name: "Новый участник",
  email: "participant@example.test",
  password: "TestPassword2026!",
  phone: "+7 (999) 123-45-67",
  city: "Москва",
};

function request(data: unknown = registration) {
  return new NextRequest("http://localhost/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.where.mockResolvedValue([]);
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: 7 }]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockResolvedValue(undefined);
  mocks.signUpEmail.mockResolvedValue({ user: { id: "new-user" } });
});

describe("open registration with Russian contact numbers", () => {
  it("requires the full name before creating an account", async () => {
    const response = await POST(request({ ...registration, name: "nickname" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("фамилию и имя");
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([
    "anna@personal.example",
    "ivan@personal.example",
    "member@personal.example",
    "employee@work.example",
  ])("accepts any valid personal or work email: %s", async (email) => {
    const response = await POST(request({ ...registration, email }));
    expect(response.status).toBe(200);
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: { name: registration.name, email, password: registration.password },
    });
  });

  it("still rejects a malformed email", async () => {
    expect(
      (await POST(request({ ...registration, email: "not-an-email" }))).status,
    ).toBe(400);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("registers a phone the organizer has never added", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.signUpEmail).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith({
      userId: "new-user",
      name: registration.name,
      email: registration.email,
      phone: "79991234567",
      city: "Москва",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("never claims an imported participant just by a matching contact phone", async () => {
    mocks.where.mockResolvedValue([{ id: 7, userId: null }]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "new-user",
        email: registration.email,
      }),
    );
  });

  it("creates a new participant if the optional placeholder was already claimed", async () => {
    mocks.where.mockResolvedValue([{ id: 7, userId: null }]);
    mocks.returning.mockResolvedValue([]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user" }),
    );
  });

  it("does not create or link a participant when account creation fails", async () => {
    mocks.signUpEmail.mockRejectedValue({
      body: { code: "USER_ALREADY_EXISTS" },
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("уже существует");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an empty phone without creating an account", async () => {
    const response = await POST(request({ ...registration, phone: "+ ()" }));
    expect(response.status).toBe(400);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it.each([
    "+1 202 555 0100",
    "+7 701 555 0100",
    "+7 999 123",
    "+7 000 000 0000",
  ])(
    "rejects a foreign or invalid phone before creating an account: %s",
    async (phone) => {
      const response = await POST(request({ ...registration, phone }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("номер телефона РФ");
      expect(mocks.signUpEmail).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );

  it("normalizes a Russian trunk-prefix number before storage", async () => {
    const response = await POST(
      request({ ...registration, phone: "8 (999) 123-45-67" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "79991234567" }),
    );
  });

  it.each([
    undefined,
    null,
    "",
    "  ",
    "Лондон",
    "Астана",
    "Мирный",
    "<script>Москва</script>",
    123,
    { city: "Москва" },
  ])(
    "rejects a missing, foreign, ambiguous or forged city before account creation: %j",
    async (city) => {
      const response = await POST(request({ ...registration, city }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(
        "Выберите город РФ из списка",
      );
      expect(mocks.signUpEmail).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
    },
  );
  it("stores the canonical selected city in a new, still-unconfirmed profile", async () => {
    const response = await POST(request({ ...registration, city: "  уФа  " }));
    expect(response.status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ city: "Уфа", userId: "new-user" }),
    );
    const saved = mocks.values.mock.calls[0][0];
    expect(saved).not.toHaveProperty("consentAt");
    expect(saved).not.toHaveProperty("track");
    expect(mocks.signUpEmail.mock.calls[0][0].body).not.toHaveProperty("city");
  });
  it("keeps equal city names in different regions distinct", async () => {
    for (const city of [
      "Мирный (Архангельская область)",
      "Мирный (Республика Саха /Якутия/)",
    ]) {
      expect((await POST(request({ ...registration, city }))).status).toBe(200);
    }
    expect(mocks.values.mock.calls.map(([saved]) => saved.city)).toEqual([
      "Мирный (Архангельская область)",
      "Мирный (Республика Саха /Якутия/)",
    ]);
  });

  it("handles malformed JSON as a validation error", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/signup", {
        method: "POST",
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });
});
