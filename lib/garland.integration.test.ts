import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const state = vi.hoisted(() => ({
  actor: null as { id: string; role: string } | null,
  participant: null as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => state.actor,
  isAdmin: async () => state.actor?.role === "admin",
  getOrCreateParticipant: async () => state.participant,
}));
import { db, schema } from "@/lib/db";
import { executeDraw } from "./draw-runner";
import { EVENT_DEFAULTS } from "./event-config";
import { getGarlandSnapshot } from "./garland-snapshot";
import { PUT as updateGift } from "@/app/api/gifts/[id]/route";
import { POST as importMembers } from "@/app/api/participants/import/route";
import { PUT as updateProfile } from "@/app/api/profile/route";
import { POST as startDraw, DELETE as cancelDraw } from "@/app/api/draw/route";
import { PUT as updateEvent } from "@/app/api/event/route";

function jsonRequest(body: object) {
  return new NextRequest("http://test.internal/api", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function giftRequest(id: number, body: object) {
  return updateGift(jsonRequest(body), {
    params: Promise.resolve({ id: String(id) }),
  });
}
async function draft() {
  const [row] = await db
    .insert(schema.draw)
    .values({
      name: "Проверка",
      garlandVersion: 1,
      ringPolicy: "tracks",
      deliverEmail: true,
      deliverPush: true,
    })
    .returning();
  return row;
}
async function config(open: boolean) {
  const value = JSON.stringify({ ...EVENT_DEFAULTS, registrationOpen: open });
  await db
    .insert(schema.appSetting)
    .values({ key: "event.config", value })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value } });
}

// Explicit opt-in and database-name guard: never run writes against the user's database.
describe.skipIf(process.env.RUN_DB_TESTS !== "1")(
  "isolated PostgreSQL lifecycle",
  () => {
    beforeAll(async () => {
      const result = await db.execute(sql`SELECT current_database() AS name`);
      if (result.rows[0]?.name !== "santa_verification")
        throw new Error("Refusing to modify a non-verification database");
      await migrate(db, { migrationsFolder: "./drizzle" });
    });
    beforeEach(async () => {
      await db.execute(
        sql`TRUNCATE gift_audit, assignment, coordinator_scope, participant, draw, "user", app_setting RESTART IDENTITY CASCADE`,
      );
      await db.insert(schema.user).values(
        ["u1", "u2", "u3", "admin", "stranger", "coord"].map((id) => ({
          id,
          name: id,
          email: `${id}@corp.test`,
          role: id === "admin" ? "admin" : "user",
        })),
      );
      await db.insert(schema.participant).values(
        [1, 2, 3].map((n) => ({
          userId: `u${n}`,
          name: `Человек ${n}`,
          email: `u${n}@corp.test`,
          city: "Уфа",
          site: "Склад",
          shift: "",
          track: "local" as const,
          wishes: "Чай",
          consentAt: new Date(),
          reserveVolunteer: n === 3,
        })),
      );
      await config(false);
      state.actor = { id: "admin", role: "admin" };
      state.participant = null;
    });
    afterAll(async () => {
      await db.$client.end();
    });

    it("updates registration aggregates without drawing and excludes unconfirmed accounts", async () => {
      await db.insert(schema.participant).values([
        { name: "Не участвует", city: "Томск", site: "Офис" },
        {
          name: "Новая анкета",
          city: "Казань",
          site: "Офис",
          track: "local",
          wishes: "Книга",
          consentAt: new Date(),
        },
      ]);
      const snapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
      expect(snapshot.phase).toBe("registration");
      expect(snapshot.summary).toMatchObject({ total: 4, received: 0 });
      expect(snapshot.summary.cities.map((c) => c.city)).toEqual([
        "Казань",
        "Уфа",
      ]);
      expect(await db.select().from(schema.draw)).toHaveLength(0);
      expect(await db.select().from(schema.assignment)).toHaveLength(0);
      expect(JSON.stringify(snapshot)).not.toMatch(
        /Новая анкета|Не участвует|corp\.test/,
      );
    });

    it("lights only received assignments and leaves them unchanged when another account appears", async () => {
      await executeDraw(await draft());
      const before = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      await db
        .update(schema.assignment)
        .set({ sentAt: new Date() })
        .where(eq(schema.assignment.id, before[0].id));
      expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.received).toBe(
        0,
      );
      await db
        .update(schema.assignment)
        .set({ receivedAt: new Date() })
        .where(eq(schema.assignment.id, before[0].id));
      await db
        .insert(schema.participant)
        .values({ name: "Поздний аккаунт", city: "Томск", site: "Офис" });
      const snapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
      expect(snapshot.phase).toBe("gifts");
      expect(snapshot.summary).toMatchObject({ total: 3, received: 1 });
      const after = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      expect(
        after.map((a) => [a.giverId, a.receiverId, a.revealToken]),
      ).toEqual(before.map((a) => [a.giverId, a.receiverId, a.revealToken]));
    });

    it("executes a draw once under concurrent calls", async () => {
      const draw = await draft();
      // More simultaneous transactions than the 10-connection pool: settings
      // must be read on the transaction connection, not via a second checkout.
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () => executeDraw(draw)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const assignments = await db.select().from(schema.assignment);
      expect(assignments).toHaveLength(3);
      expect(new Set(assignments.map((a) => a.giverId)).size).toBe(3);
      expect(new Set(assignments.map((a) => a.receiverId)).size).toBe(3);
      const [saved] = await db
        .select()
        .from(schema.draw)
        .where(eq(schema.draw.id, draw.id));
      expect(saved.status).toBe("completed");
      expect(saved.deliverEmail).toBe(false);
      expect(saved.deliverPush).toBe(false);
    });
    it("supports password signup and login with the updated auth library", async () => {
      const { auth } = await import("@/lib/auth");
      const body = {
        name: "Проверка входа",
        email: "auth-check@corp.test",
        password: "TestPasswordOnly2026!",
      };
      const signup = await auth.api.signUpEmail({ body, asResponse: true });
      expect(signup.status).toBe(200);
      const login = await auth.api.signInEmail({
        body: { email: body.email, password: body.password },
        asResponse: true,
      });
      expect(login.status).toBe(200);
      expect(login.headers.get("set-cookie")).toContain("session_token");
    });
    it("rolls back infeasible tracks without partial assignments", async () => {
      await db
        .update(schema.participant)
        .set({ city: "Томск" })
        .where(eq(schema.participant.id, 3));
      const draw = await draft();
      await expect(executeDraw(draw)).rejects.toThrow("минимум 3");
      expect(await db.select().from(schema.assignment)).toHaveLength(0);
      expect((await db.select().from(schema.draw))[0].status).toBe("draft");
    });
    it("cannot redraw a completed garland through the API", async () => {
      await executeDraw(await draft());
      const response = await startDraw(jsonRequest({ name: "Повтор" }));
      expect(response.status).toBe(400);
      expect(await db.select().from(schema.draw)).toHaveLength(1);
      expect(await db.select().from(schema.assignment)).toHaveLength(3);
    });
    it("freezes opt-in and budget after draw but allows map publication", async () => {
      const d = await draft();
      await db
        .update(schema.draw)
        .set({ budget: EVENT_DEFAULTS.budget })
        .where(eq(schema.draw.id, d.id));
      await executeDraw(d);
      expect(
        (
          await updateEvent(
            jsonRequest({ ...EVENT_DEFAULTS, registrationOpen: true }),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await updateEvent(
            jsonRequest({
              ...EVENT_DEFAULTS,
              registrationOpen: false,
              budget: 2000,
            }),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await updateEvent(
            jsonRequest({
              ...EVENT_DEFAULTS,
              registrationOpen: false,
              mapPublished: true,
            }),
          )
        ).status,
      ).toBe(200);
    });
    it("cancels only unexecuted drafts", async () => {
      const pending = await draft();
      expect((await cancelDraw(jsonRequest({ id: pending.id }))).status).toBe(
        200,
      );
      const active = await draft();
      await executeDraw(active);
      expect((await cancelDraw(jsonRequest({ id: active.id }))).status).toBe(
        400,
      );
      expect(await db.select().from(schema.assignment)).toHaveLength(3);
    });
    it("keeps legacy draw history without freezing new participation", async () => {
      const [old] = await db
        .insert(schema.draw)
        .values({ name: "Старая версия", status: "completed" })
        .returning();
      await db.insert(schema.assignment).values({
        drawId: old.id,
        giverId: 1,
        receiverId: 2,
        revealToken: "legacy-token",
      });
      state.actor = { id: "u1", role: "user" };
      state.participant = (
        await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, 1))
      )[0];
      await config(true);
      expect(
        (
          await updateProfile(
            jsonRequest({
              city: "Уфа",
              site: "Склад",
              shift: "",
              track: "local",
              wishes: "Книги",
              pickupPoint: "",
              consent: true,
              reserveVolunteer: false,
            }),
          )
        ).status,
      ).toBe(200);
    });
    it("a giver cannot confirm receipt, but the receiver can do so once", async () => {
      await executeDraw(await draft());
      const [gift] = await db.select().from(schema.assignment);
      state.actor = { id: `u${gift.giverId}`, role: "user" };
      expect((await giftRequest(gift.id, { action: "received" })).status).toBe(
        403,
      );
      state.actor = { id: `u${gift.receiverId}`, role: "user" };
      const responses = await Promise.all([
        giftRequest(gift.id, { action: "received" }),
        giftRequest(gift.id, { action: "received" }),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(await db.select().from(schema.giftAudit)).toHaveLength(1);
      expect(
        (
          await db
            .select()
            .from(schema.assignment)
            .where(eq(schema.assignment.id, gift.id))
        )[0].receivedAt,
      ).not.toBeNull();
    });
    it("enforces actual coordinator scope stored in PostgreSQL", async () => {
      await executeDraw(await draft());
      const [gift] = await db.select().from(schema.assignment);
      state.actor = { id: "coord", role: "user" };
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: "Томск", site: "Офис" });
      expect((await giftRequest(gift.id, { action: "received" })).status).toBe(
        403,
      );
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: "Уфа", site: "Склад" });
      expect((await giftRequest(gift.id, { action: "received" })).status).toBe(
        200,
      );
    });
    it("requires a valid reserve volunteer and closes reserve only on receipt", async () => {
      await executeDraw(await draft());
      const gifts = await db.select().from(schema.assignment);
      const gift = gifts.find((g) => g.receiverId !== 3)!;
      state.actor = { id: `u${gift.receiverId}`, role: "user" };
      expect(
        (await giftRequest(gift.id, { action: "request_reserve" })).status,
      ).toBe(200);
      expect(
        (
          await giftRequest(gift.id, {
            action: "assign_reserve",
            volunteerId: 3,
          })
        ).status,
      ).toBe(403);
      state.actor = { id: "admin", role: "admin" };
      expect(
        (
          await giftRequest(gift.id, {
            action: "assign_reserve",
            volunteerId: gift.receiverId,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await giftRequest(gift.id, {
            action: "assign_reserve",
            volunteerId: 3,
          })
        ).status,
      ).toBe(200);
      state.actor = { id: "stranger", role: "user" };
      expect(
        (await giftRequest(gift.id, { action: "reserve_sent" })).status,
      ).toBe(403);
      state.actor = { id: "u3", role: "user" };
      expect(
        (
          await giftRequest(gift.id, {
            action: "reserve_sent",
            kind: "certificate",
            note: "У координатора",
          })
        ).status,
      ).toBe(200);
      let saved = (
        await db
          .select()
          .from(schema.assignment)
          .where(eq(schema.assignment.id, gift.id))
      )[0];
      expect(saved.reserveSentAt).not.toBeNull();
      expect(saved.receivedAt).toBeNull();
      expect(saved.reserveState).toBe("assigned");
      state.actor = { id: `u${gift.receiverId}`, role: "user" };
      expect((await giftRequest(gift.id, { action: "received" })).status).toBe(
        200,
      );
      saved = (
        await db
          .select()
          .from(schema.assignment)
          .where(eq(schema.assignment.id, gift.id))
      )[0];
      expect(saved.reserveState).toBe("resolved");
    });
    it("rejects anonymous status changes", async () => {
      state.actor = null;
      expect((await giftRequest(1, { action: "received" })).status).toBe(401);
    });
    it("imports a coordinator list atomically, with consent and scope checks", async () => {
      await config(true);
      state.actor = { id: "coord", role: "user" };
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: "Уфа", site: "Склад" });
      const text = "Анна;;Уфа;Склад;;Рядом;;Чай";
      expect(
        (await importMembers(jsonRequest({ text, consentConfirmed: false })))
          .status,
      ).toBe(400);
      expect(
        (
          await importMembers(
            jsonRequest({
              text: "Иван;;Томск;Склад;;Рядом;;Чай",
              consentConfirmed: true,
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (await importMembers(jsonRequest({ text, consentConfirmed: true })))
          .status,
      ).toBe(200);
      const before = (await db.select().from(schema.participant)).length;
      expect(
        (
          await importMembers(
            jsonRequest({
              text: `Олег;;Уфа;Склад;;Рядом;;Чай\n${text}`,
              consentConfirmed: true,
            }),
          )
        ).status,
      ).toBe(400);
      expect((await db.select().from(schema.participant)).length).toBe(before);
    });
    it("saves optional sites and includes those profiles in the draw", async () => {
      await config(true);
      for (const id of [1, 2, 3]) {
        state.actor = { id: `u${id}`, role: "user" };
        state.participant = (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, id))
        )[0];
        const response = await updateProfile(
          jsonRequest({
            city: "Уфа",
            ...(id === 1 ? {} : { site: "" }),
            shift: "",
            track: "local",
            wishes: "Книги",
            pickupPoint: "",
            consent: true,
            reserveVolunteer: false,
          }),
        );
        expect(response.status).toBe(200);
      }
      const profiles = await db.select().from(schema.participant);
      expect(profiles.every((participant) => participant.site === "")).toBe(
        true,
      );
      await config(false);
      state.actor = { id: "admin", role: "admin" };
      await executeDraw(await draft());
      const assignments = await db.select().from(schema.assignment);
      expect(assignments).toHaveLength(3);
      expect(new Set(assignments.map((pair) => pair.receiverId)).size).toBe(3);
      expect(
        assignments.every((pair) => pair.giverId !== pair.receiverId),
      ).toBe(true);
    });
    it("freezes delivery profiles after draw while retaining all previous rows", async () => {
      state.actor = { id: "u1", role: "user" };
      state.participant = (
        await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, 1))
      )[0];
      const body = {
        city: "Уфа",
        site: "Склад",
        shift: "",
        track: "local",
        wishes: "Книги",
        pickupPoint: "",
        consent: true,
        reserveVolunteer: false,
      };
      await config(true);
      expect((await updateProfile(jsonRequest(body))).status).toBe(200);
      await config(false);
      await executeDraw(await draft());
      expect(
        (await updateProfile(jsonRequest({ ...body, city: "Томск" }))).status,
      ).toBe(400);
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, 1))
        )[0].city,
      ).toBe("Уфа");
    });
  },
);
