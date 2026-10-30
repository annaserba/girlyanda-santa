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
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const state = vi.hoisted(() => ({
  actor: null as { id: string; role: string } | null,
  participant: null as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
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
import { GET as listSites, PATCH as editSites } from "@/app/api/sites/route";
import { POST as assignCoordinator } from "@/app/api/coordinators/route";
import { getSiteOptions, resolveSiteName } from "./sites";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipientDetails } from "./gift-display";
import { getAdminGarlandSnapshot } from "./admin-garland-snapshot";
import { POST as registerParticipant } from "@/app/api/signup/route";
import { POST as addWish, GET as ownWishes } from "@/app/api/wishlist/route";
import { DELETE as deleteWish } from "@/app/api/wishlist/[id]/route";
import { getGarlandDisplay } from "./garland-display";
import { canonical } from "./event-config";
import { runDueDraws } from "./scheduler";
import { buildBulkMailto } from "./bulk-email";
import DashboardPage from "@/app/dashboard/page";

async function ensureSite(city: string, name: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    await resolveSiteName(tx, city, name);
  });
  return (await getSiteOptions()).find(
    (s) => s.city === city && s.name === name,
  )!;
}

function jsonRequest(body: object) {
  return new NextRequest("http://test.internal/api", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function profileRequest(body: object) {
  return jsonRequest({ name: "Иванова Анна", ...body });
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
        sql`TRUNCATE work_site_alias, work_site, gift_audit, assignment, coordinator_scope, participant, draw, "user", app_setting RESTART IDENTITY CASCADE`,
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
          name: `Тестовый Участник-${n}`,
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
      await ensureSite("Уфа", "Склад");
      state.actor = { id: "admin", role: "admin" };
      state.participant = null;
    });
    afterAll(async () => {
      await db.$client.end();
    });

    it("denies personal map data to guests, members and coordinators", async () => {
      for (const actor of [
        null,
        { id: "u1", role: "user" },
        { id: "coord", role: "user" },
      ]) {
        state.actor = actor;
        await expect(getAdminGarlandSnapshot(EVENT_DEFAULTS)).rejects.toThrow(
          "только организатору",
        );
      }
    });
    it("shows names only for opted-in map participants and excludes contact and reveal data", async () => {
      await db.insert(schema.participant).values({
        name: "Не подтвердил участие",
        city: "Москва",
        site: "Офис",
      });
      const privateSnapshot = await getAdminGarlandSnapshot(EVENT_DEFAULTS);
      expect(privateSnapshot.phase).toBe("registration");
      expect(privateSnapshot.people).toHaveLength(3);
      expect(privateSnapshot.people.map((p) => p.name)).toContain(
        "Тестовый Участник-1",
      );
      expect(privateSnapshot.people.map((p) => p.name)).not.toContain(
        "Не подтвердил участие",
      );
      expect(JSON.stringify(privateSnapshot)).not.toMatch(
        /email|phone|pickupPoint|revealToken|@corp\.test/,
      );
      const publicSnapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
      expect(JSON.stringify(publicSnapshot)).not.toContain(
        "Тестовый Участник-1",
      );
    });
    it("reads actual gift pairs and states without changing assignments or including late accounts", async () => {
      await executeDraw(await draft());
      const [gift] = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      await db
        .update(schema.assignment)
        .set({ sentAt: new Date(), receivedAt: new Date() })
        .where(eq(schema.assignment.id, gift.id));
      const before = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      await db.insert(schema.participant).values({
        name: "Поздний Участник",
        city: "Москва",
        site: "Офис",
        track: "local",
        wishes: "Книга",
        consentAt: new Date(),
      });
      const snapshot = await getAdminGarlandSnapshot(EVENT_DEFAULTS);
      expect(snapshot.phase).toBe("gifts");
      expect(snapshot.people).toHaveLength(3);
      expect(snapshot.gifts).toHaveLength(3);
      expect(
        snapshot.gifts.find((g) => g.giverId === gift.giverId),
      ).toMatchObject({
        receiverId: gift.receiverId,
        sent: true,
        received: true,
      });
      expect(snapshot.summary.received).toBe(1);
      expect(
        await db.select().from(schema.assignment).orderBy(schema.assignment.id),
      ).toEqual(before);
    });

    it("saves the recipient's full name and shows it to their Santa without changing the account", async () => {
      await config(true);
      state.actor = { id: "u1", role: "user" };
      state.participant = (
        await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, 1))
      )[0];
      const response = await updateProfile(
        profileRequest({
          name: " Иванова   Анна Сергеевна ",
          city: "Уфа",
          site: "Склад",
          track: "local",
          wishes: "Книга",
          consent: true,
        }),
      );
      expect(response.status).toBe(200);
      const [saved] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      expect(saved.name).toBe("Иванова Анна Сергеевна");
      expect(saved.userId).toBe("u1");
      expect(
        (await db.select().from(schema.user).where(eq(schema.user.id, "u1")))[0]
          .name,
      ).toBe("u1");
      const html = renderToStaticMarkup(
        RecipientDetails({ person: saved, local: true }),
      );
      expect(html).toContain("Иванова Анна Сергеевна");
      const snapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
      expect(JSON.stringify(snapshot)).not.toContain("Иванова");
    });
    it("rejects missing names and nicknames without replacing the existing recipient name", async () => {
      await config(true);
      state.actor = { id: "u1", role: "user" };
      const [before] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      state.participant = before;
      for (const name of [undefined, "", "local_user"]) {
        const response = await updateProfile(
          profileRequest({
            name,
            city: "Уфа",
            site: "Склад",
            track: "local",
            wishes: "Книга",
            consent: true,
          }),
        );
        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain("фамилию и имя");
      }
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, 1))
        )[0],
      ).toEqual(before);
    });
    it("allows withdrawing a legacy profile without requiring a new full name", async () => {
      await config(true);
      await db
        .update(schema.participant)
        .set({ name: "local_user" })
        .where(eq(schema.participant.id, 1));
      state.actor = { id: "u1", role: "user" };
      state.participant = (
        await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, 1))
      )[0];
      const response = await updateProfile(
        profileRequest({
          name: "",
          city: "Уфа",
          site: "Склад",
          track: "local",
          wishes: "Книга",
          consent: false,
        }),
      );
      expect(response.status).toBe(200);
      const [saved] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      expect(saved.name).toBe("local_user");
      expect(saved.consentAt).toBeNull();
    });

    it("backfills legacy case variants from profiles and coordinator scopes into one identity", async () => {
      await db.delete(schema.workSiteAlias);
      await db.delete(schema.workSite);
      await db
        .update(schema.participant)
        .set({ site: "Офис Север" })
        .where(eq(schema.participant.id, 1));
      await db
        .update(schema.participant)
        .set({ site: "ОФИС  СЕВЁР" })
        .where(eq(schema.participant.id, 2));
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: " УФА ", site: "офис север" });
      const statements = readFileSync("drizzle/0010_work_sites.sql", "utf8")
        .split("--> statement-breakpoint")
        .slice(-2);
      for (const statement of statements) await db.execute(sql.raw(statement));
      const options = await getSiteOptions();
      expect(options).toHaveLength(2);
      expect(options.filter((s) => s.name === "Офис Север")).toHaveLength(1);
      expect(await db.select().from(schema.workSiteAlias)).toHaveLength(2);
    });
    it("serializes simultaneous additions and deduplicates case variants", async () => {
      await Promise.all(
        ["Офис Север", "офис  СЕВЁР"].map((name) =>
          db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
            return resolveSiteName(tx, "Уфа", name);
          }),
        ),
      );
      expect(
        (await getSiteOptions()).filter((s) => s.name !== "Склад"),
      ).toHaveLength(1);
    });
    it("reuses a catalog entry when a profile submits a different case", async () => {
      await config(true);
      await ensureSite("Уфа", "Офис Север");
      state.actor = { id: "u1", role: "user" };
      state.participant = (
        await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, 1))
      )[0];
      const response = await updateProfile(
        profileRequest({
          city: "Уфа",
          site: "офис  СЕВЁР",
          track: "local",
          wishes: "Книга",
          consent: true,
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).site).toBe("Офис Север");
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, 1))
        )[0].site,
      ).toBe("Офис Север");
      expect(await getSiteOptions()).toHaveLength(2);
    });
    it("renames profiles and permissions after a draw while preserving all assignments", async () => {
      const source = (await getSiteOptions())[0];
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: "уфа", site: "склад" });
      await executeDraw(await draft());
      const before = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      const response = await editSites(
        jsonRequest({
          action: "rename",
          sourceId: source.id,
          name: "Логистический центр",
        }),
      );
      expect(response.status).toBe(200);
      expect(
        (await db.select().from(schema.participant)).every(
          (p) => p.site === "Логистический центр",
        ),
      ).toBe(true);
      expect((await db.select().from(schema.coordinatorScope))[0].site).toBe(
        "логистический центр",
      );
      expect(
        await db.select().from(schema.assignment).orderBy(schema.assignment.id),
      ).toEqual(before);
    });
    it("rejects conflicting renames and cross-city merges without changing profiles", async () => {
      const source = (await getSiteOptions())[0];
      const target = await ensureSite("Уфа", "Офис");
      const otherCity = await ensureSite("Томск", "Офис");
      const before = await db.select().from(schema.participant);
      expect(
        (
          await editSites(
            jsonRequest({
              action: "rename",
              sourceId: source.id,
              name: "ОФИС",
            }),
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await editSites(
            jsonRequest({
              action: "merge",
              sourceId: source.id,
              targetId: otherCity.id,
            }),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await editSites(
            jsonRequest({
              action: "merge",
              sourceId: target.id,
              targetId: target.id,
            }),
          )
        ).status,
      ).toBe(400);
      expect(await db.select().from(schema.participant)).toEqual(before);
      expect(await getSiteOptions()).toHaveLength(3);
    });
    it("merges identities, retains coordinator permissions and leaves gift pairs unchanged", async () => {
      const source = (await getSiteOptions())[0];
      const target = await ensureSite("Уфа", "Офис");
      await db.insert(schema.participant).values(
        [4, 5, 6].map((n) => ({
          name: `Тестовый Участник-${n}`,
          city: "Уфа",
          site: "Офис",
          track: "local" as const,
          wishes: "Чай",
          consentAt: new Date(),
        })),
      );
      await db.insert(schema.coordinatorScope).values([
        { userId: "coord", city: "уфа", site: "склад" },
        { userId: "coord", city: "уфа", site: "офис" },
        { userId: "u3", city: "уфа", site: "склад" },
        { userId: "stranger", city: "томск", site: "склад" },
      ]);
      await executeDraw(await draft());
      const before = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      expect(
        (
          await editSites(
            jsonRequest({
              action: "merge",
              sourceId: source.id,
              targetId: target.id,
            }),
          )
        ).status,
      ).toBe(200);
      expect(await getSiteOptions()).toEqual([target]);
      expect(
        (await db.select().from(schema.participant)).every(
          (p) => p.site === "Офис",
        ),
      ).toBe(true);
      const scopes = await db.select().from(schema.coordinatorScope);
      expect(scopes).toHaveLength(3);
      expect(
        scopes.filter((s) => s.userId === "coord" && s.site === "офис"),
      ).toHaveLength(1);
      expect(scopes.find((s) => s.userId === "stranger")?.site).toBe("склад");
      expect(
        await db.select().from(schema.assignment).orderBy(schema.assignment.id),
      ).toEqual(before);
    });
    it("resolves old forms and coordinator imports after both rename and merge", async () => {
      await config(true);
      const source = (await getSiteOptions())[0];
      const target = await ensureSite("Уфа", "Офис");
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: "уфа", site: "склад" });
      expect(
        (
          await editSites(
            jsonRequest({
              action: "rename",
              sourceId: source.id,
              name: "Терминал",
            }),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await editSites(
            jsonRequest({
              action: "merge",
              sourceId: source.id,
              targetId: target.id,
            }),
          )
        ).status,
      ).toBe(200);
      state.actor = { id: "u1", role: "user" };
      state.participant = (
        await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, 1))
      )[0];
      const response = await updateProfile(
        profileRequest({
          city: "Уфа",
          site: "СКЛАД",
          track: "local",
          wishes: "Чай",
          consent: true,
        }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).site).toBe("Офис");
      state.actor = { id: "coord", role: "user" };
      const imported = await importMembers(
        jsonRequest({
          text: "Петрова Елена;;Уфа;ТЕРМИНАЛ;;Рядом;;Книга",
          consentConfirmed: true,
        }),
      );
      expect(imported.status).toBe(200);
      expect(
        (await db.select().from(schema.participant)).every(
          (p) => p.site === "Офис",
        ),
      ).toBe(true);
      expect(await getSiteOptions()).toEqual([target]);
    });
    it("restricts catalog access and editing and does not create sites for rejected imports", async () => {
      const source = (await getSiteOptions())[0];
      state.actor = null;
      expect((await listSites()).status).toBe(401);
      expect(
        (
          await editSites(
            jsonRequest({
              action: "rename",
              sourceId: source.id,
              name: "Чужое",
            }),
          )
        ).status,
      ).toBe(403);
      state.actor = { id: "coord", role: "user" };
      expect(
        (
          await editSites(
            jsonRequest({
              action: "rename",
              sourceId: source.id,
              name: "Чужое",
            }),
          )
        ).status,
      ).toBe(403);
      const visible = await listSites();
      expect(visible.status).toBe(200);
      expect(Object.keys((await visible.json()).sites[0]).sort()).toEqual([
        "city",
        "id",
        "name",
      ]);
      await db
        .insert(schema.coordinatorScope)
        .values({ userId: "coord", city: "уфа", site: "склад" });
      await config(true);
      const imported = await importMembers(
        jsonRequest({
          text: "Иванова Анна;;Уфа;Другая площадка;;Рядом;;Книга",
          consentConfirmed: true,
        }),
      );
      expect(imported.status).toBe(403);
      expect(await getSiteOptions()).toEqual([source]);
    });
    it("resolves an old name when assigning a coordinator after a rename", async () => {
      const source = (await getSiteOptions())[0];
      await editSites(
        jsonRequest({
          action: "rename",
          sourceId: source.id,
          name: "Терминал",
        }),
      );
      const response = await assignCoordinator(
        jsonRequest({ userId: "coord", city: "Уфа", site: "СКЛАД" }),
      );
      expect(response.status).toBe(200);
      expect(
        (await db.select().from(schema.coordinatorScope))[0],
      ).toMatchObject({ city: "уфа", site: "терминал" });
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
    it("runs the complete participant journey: real signup and login, both tracks, four rings, private wishes, reserve and all gift lights", async () => {
      await db.execute(
        sql`TRUNCATE work_site_alias, work_site, gift_audit, assignment, coordinator_scope, participant, draw, "user", app_setting RESTART IDENTITY CASCADE`,
      );
      await config(true);
      const { auth } = await import("@/lib/auth");
      const password = "JourneyTestsOnly2026!";
      const accounts: {
        cookie: string;
        userId: string;
        participantId: number;
        role: string;
        name: string;
        email: string;
      }[] = [];
      async function signup(index: number, city: string) {
        const name =
          index === 0
            ? "Проверочный Организатор"
            : `Проверочный Участник${String(index).padStart(2, "0")}`;
        const email = `journey-${index}@example.test`;
        const body = {
          name,
          email,
          password,
          phone: `+7999123${String(index).padStart(4, "0")}`,
          city,
        };
        const response = await registerParticipant(
          new NextRequest("http://test.internal/api/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        expect(await response.json()).toEqual({ ok: true });
        expect(response.status).toBe(200);
        const login = await auth.api.signInEmail({
          body: { email, password },
          asResponse: true,
        });
        expect(login.status).toBe(200);
        const cookie = login.headers.get("set-cookie")!.split(";")[0];
        const session = await auth.api.getSession({
          headers: new Headers({ cookie }),
        });
        expect(session?.user.email).toBe(email);
        const [person] = await db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.userId, session!.user.id));
        expect(person).toMatchObject({
          name,
          city,
          track: null,
          consentAt: null,
        });
        const account = {
          cookie,
          userId: session!.user.id,
          participantId: person.id,
          role: session!.user.role ?? "user",
          name,
          email,
        };
        accounts.push(account);
        return account;
      }
      async function act(account: (typeof accounts)[number]) {
        const session = await auth.api.getSession({
          headers: new Headers({ cookie: account.cookie }),
        });
        expect(session?.user.id).toBe(account.userId);
        state.actor = {
          id: session!.user.id,
          role: session!.user.role ?? "user",
        };
        state.participant = (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, account.participantId))
        )[0];
      }
      const organizer = await signup(0, "Уфа");
      expect(organizer.role).toBe("admin");
      expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.total).toBe(0);
      const profiles = new Map<
        number,
        {
          name: string;
          city: string;
          site: string;
          shift: string;
          track: "local" | "country";
          pickupPoint: string;
          wishes: string;
          reserveVolunteer: boolean;
          consent: boolean;
        }
      >();
      for (let i = 1; i <= 12; i++) {
        const city = i <= 9 ? "Уфа" : ["Москва", "Казань", "Томск"][i - 10];
        const account = await signup(i, city);
        expect(account.role).toBe("user");
        expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.total).toBe(
          i - 1,
        );
        await act(account);
        const profile = {
          name: account.name,
          city,
          site:
            i <= 3 ? (i === 2 ? "  ОФИС  " : "Офис") : i <= 9 ? "Склад" : "",
          shift: i <= 3 || i >= 10 ? "" : i <= 6 ? "День" : "Ночь",
          track: (i <= 9 ? "local" : "country") as "local" | "country",
          pickupPoint: i >= 10 ? `ПВЗ-${i}, ${city}` : "",
          wishes: i === 10 ? "" : `Анкета-пожелание-${i}`,
          reserveVolunteer: true,
          consent: true,
        };
        if (i === 1) {
          expect(
            (
              await updateProfile(
                profileRequest({ ...profile, consent: false }),
              )
            ).status,
          ).toBe(200);
          expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.total).toBe(
            0,
          );
          expect(
            (await updateProfile(profileRequest({ ...profile, site: "" })))
              .status,
          ).toBe(400);
        }
        if (i === 10)
          expect(
            (
              await updateProfile(
                profileRequest({ ...profile, pickupPoint: "" }),
              )
            ).status,
          ).toBe(400);
        expect((await updateProfile(profileRequest(profile))).status).toBe(200);
        profiles.set(account.participantId, profile);
        const snapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
        expect(snapshot.phase).toBe("registration");
        expect(snapshot.summary).toMatchObject({ total: i, received: 0 });
        expect(await db.select().from(schema.assignment)).toHaveLength(0);
        const publicData = JSON.stringify(snapshot);
        expect(publicData).not.toMatch(
          /Проверочный|@example\.test|ПВЗ-|Анкета-пожелание|revealToken|phone/,
        );
      }
      const display = getGarlandDisplay(
        await getGarlandSnapshot(EVENT_DEFAULTS),
        EVENT_DEFAULTS,
      );
      expect(display.summary.cities).toHaveLength(10);
      for (const city of ["Уфа", "Москва", "Казань", "Томск"]) {
        const marker = display.summary.cities.find((c) => c.city === city)!;
        expect(marker.location).not.toBeNull();
        expect(marker.total).toBe(city === "Уфа" ? 9 : 1);
        expect(marker.received).toBe(0);
      }
      const edited = accounts[1];
      await act(edited);
      const original = profiles.get(edited.participantId)!;
      expect(
        (
          await updateProfile(
            profileRequest({
              ...original,
              city: "Казань",
              track: "country",
              site: "",
              pickupPoint: "ПВЗ смены трека",
            }),
          )
        ).status,
      ).toBe(200);
      expect(
        (await getGarlandSnapshot(EVENT_DEFAULTS)).summary.cities.find(
          (c) => c.city === "Казань",
        )!.total,
      ).toBe(2);
      expect((await updateProfile(profileRequest(original))).status).toBe(200);
      expect(
        (await updateProfile(profileRequest({ ...original, consent: false })))
          .status,
      ).toBe(200);
      expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.total).toBe(11);
      expect((await updateProfile(profileRequest(original))).status).toBe(200);
      expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.total).toBe(12);
      expect(
        (await startDraw(jsonRequest({ name: "Не организатор" }))).status,
      ).toBe(403);
      await act(organizer);
      expect(
        (await startDraw(jsonRequest({ name: "Слишком рано" }))).status,
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
      await act(edited);
      expect(
        (
          await updateProfile(
            profileRequest({ ...original, wishes: "Обновлённые пожелания" }),
          )
        ).status,
      ).toBe(200);
      await act(edited);
      const savedProfileView = renderToStaticMarkup(await DashboardPage());
      expect(savedProfileView).toContain("Обновлённые пожелания");
      expect(savedProfileView).toContain("Редактировать анкету");
      const late = await signup(13, "Сочи");
      await act(late);
      expect(
        (
          await updateProfile(
            profileRequest({
              name: late.name,
              city: "Сочи",
              site: "Офис",
              track: "local",
              consent: true,
            }),
          )
        ).status,
      ).toBe(400);
      await act(organizer);
      const drawResponse = await startDraw(
        jsonRequest({ name: "Сквозная проверка" }),
      );
      expect(drawResponse.status).toBe(201);
      const drawResult = await drawResponse.json();
      expect(drawResult).toMatchObject({ assignments: 12, rings: 4 });
      const gifts = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      const edges = gifts.map((g) => [g.giverId, g.receiverId, g.revealToken]);
      expect(new Set(gifts.map((g) => g.giverId)).size).toBe(12);
      expect(new Set(gifts.map((g) => g.receiverId)).size).toBe(12);
      for (const gift of gifts) {
        expect(gift.giverId).not.toBe(gift.receiverId);
        expect(
          gifts.some(
            (p) =>
              p.giverId === gift.receiverId && p.receiverId === gift.giverId,
          ),
        ).toBe(false);
        const giver = profiles.get(gift.giverId)!;
        const receiver = profiles.get(gift.receiverId)!;
        expect(giver.track).toBe(receiver.track);
        if (giver.track === "local") {
          expect(canonical(giver.city)).toBe(canonical(receiver.city));
          expect(canonical(giver.site)).toBe(canonical(receiver.site));
          expect(canonical(giver.shift)).toBe(canonical(receiver.shift));
        } else expect(canonical(giver.city)).not.toBe(canonical(receiver.city));
      }
      const privateMap = await getAdminGarlandSnapshot(EVENT_DEFAULTS);
      expect(privateMap.people).toHaveLength(12);
      expect(privateMap.gifts).toHaveLength(12);
      expect(privateMap.people.map((p) => p.id)).not.toContain(
        late.participantId,
      );
      expect(JSON.stringify(privateMap)).not.toMatch(
        /@example\.test|ПВЗ-|revealToken|phone/,
      );
      await act(accounts[10]);
      const ownGift = gifts.find(
        (g) => g.giverId === accounts[10].participantId,
      )!;
      const receiverAccount = accounts.find(
        (a) => a.participantId === ownGift.receiverId,
      )!;
      await act(receiverAccount);
      const wishResponse = await addWish(
        jsonRequest({
          text: "ПОЖЕЛАНИЕ-ДЛЯ-МОЕГО-САНТЫ",
          url: "https://example.test/gift",
        }),
      );
      expect(wishResponse.status).toBe(201);
      const wish = await wishResponse.json();
      expect(
        (await (await ownWishes()).json()).some(
          (w: { id: number }) => w.id === wish.id,
        ),
      ).toBe(true);
      await act(accounts[10]);
      expect(
        (
          await deleteWish(jsonRequest({}), {
            params: Promise.resolve({ id: String(wish.id) }),
          })
        ).status,
      ).toBe(200);
      expect(
        await db
          .select()
          .from(schema.wishlistItem)
          .where(eq(schema.wishlistItem.id, wish.id)),
      ).toHaveLength(1);
      const cabinet = renderToStaticMarkup(await DashboardPage());
      expect(cabinet).toContain(receiverAccount.name);
      expect(cabinet).toContain("ПОЖЕЛАНИЕ-ДЛЯ-МОЕГО-САНТЫ");
      expect(cabinet).not.toContain("Редактировать анкету");
      const santa = accounts.find(
        (a) =>
          a.participantId ===
          gifts.find((g) => g.receiverId === accounts[10].participantId)!
            .giverId,
      )!;
      expect(cabinet).not.toContain(santa.name);
      expect(
        (
          await updateProfile(
            profileRequest(profiles.get(accounts[10].participantId)!),
          )
        ).status,
      ).toBe(400);
      state.actor = null;
      state.participant = null;
      expect((await giftRequest(gifts[0].id, { action: "sent" })).status).toBe(
        401,
      );
      await act(late);
      expect((await giftRequest(gifts[0].id, { action: "sent" })).status).toBe(
        403,
      );
      for (let i = 0; i < gifts.length; i++) {
        const gift = gifts[i];
        await act(accounts.find((a) => a.participantId === gift.giverId)!);
        const body = {
          action: "sent",
          kind: ["physical", "skill", "certificate"][i % 3],
          note: `Передача-${i}`,
        };
        expect((await giftRequest(gift.id, body)).status).toBe(200);
        expect((await giftRequest(gift.id, body)).status).toBe(200);
        expect(
          (await giftRequest(gift.id, { action: "received" })).status,
        ).toBe(403);
      }
      expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary).toMatchObject({
        total: 12,
        received: 0,
      });
      expect(
        (await db.select().from(schema.giftAudit)).filter(
          (a) => a.action === "sent",
        ),
      ).toHaveLength(12);
      const reserveGift = gifts[0];
      await act(
        accounts.find((a) => a.participantId === reserveGift.receiverId)!,
      );
      expect(
        (await giftRequest(reserveGift.id, { action: "request_reserve" }))
          .status,
      ).toBe(200);
      const volunteer = accounts.find(
        (a) =>
          a.role !== "admin" &&
          a.participantId !== reserveGift.receiverId &&
          a.participantId !== late.participantId,
      )!;
      await act(organizer);
      expect(
        (
          await giftRequest(reserveGift.id, {
            action: "assign_reserve",
            volunteerId: volunteer.participantId,
          })
        ).status,
      ).toBe(200);
      await act(volunteer);
      expect(
        (
          await giftRequest(reserveGift.id, {
            action: "reserve_sent",
            kind: "certificate",
            note: "Сертификат у координатора",
          })
        ).status,
      ).toBe(200);
      expect((await getGarlandSnapshot(EVENT_DEFAULTS)).summary.received).toBe(
        0,
      );
      for (let i = 0; i < gifts.length; i++) {
        const gift = gifts[i];
        await act(accounts.find((a) => a.participantId === gift.receiverId)!);
        expect(
          (await giftRequest(gift.id, { action: "received" })).status,
        ).toBe(200);
        expect(
          (await giftRequest(gift.id, { action: "received" })).status,
        ).toBe(200);
        const snapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
        expect(snapshot.phase).toBe("gifts");
        expect(snapshot.summary).toMatchObject({ total: 12, received: i + 1 });
        for (const city of snapshot.summary.cities) {
          const received = gifts
            .slice(0, i + 1)
            .filter((p) => profiles.get(p.receiverId)!.city === city.city);
          expect(city.received).toBe(received.length);
          for (const site of city.sites) {
            expect(site.received).toBe(
              received.filter(
                (p) =>
                  canonical(profiles.get(p.receiverId)!.site) ===
                  canonical(
                    site.site === "Площадка не указана" ? "" : site.site,
                  ),
              ).length,
            );
          }
        }
      }
      const final = await getGarlandSnapshot(EVENT_DEFAULTS);
      expect(final.summary.cities.every((c) => c.received === c.total)).toBe(
        true,
      );
      const savedGifts = await db
        .select()
        .from(schema.assignment)
        .orderBy(schema.assignment.id);
      expect(
        savedGifts.map((g) => [g.giverId, g.receiverId, g.revealToken]),
      ).toEqual(edges);
      expect(savedGifts.every((g) => g.sentAt && g.receivedAt)).toBe(true);
      expect(
        savedGifts.find((g) => g.id === reserveGift.id)!.reserveState,
      ).toBe("resolved");
      expect(
        (await db.select().from(schema.giftAudit)).filter(
          (a) => a.action === "received",
        ),
      ).toHaveLength(12);
      const mail = new URL(
        buildBulkMailto(
          accounts
            .slice(1, 13)
            .map((a) => a.email)
            .join(";"),
          "Итоги обмена",
          "Войдите в кабинет: https://santa.example.test/dashboard",
        )!,
      );
      expect(mail.searchParams.get("bcc")!.split(",")).toHaveLength(12);
      expect(mail.searchParams.has("to")).toBe(false);
      expect(mail.searchParams.get("body")).not.toMatch(/reveal|Проверочный/);
      await act(organizer);
      const finalPrivateMap = await getAdminGarlandSnapshot(EVENT_DEFAULTS);
      expect(finalPrivateMap.summary.received).toBe(12);
      expect(finalPrivateMap.gifts.every((g) => g.sent && g.received)).toBe(
        true,
      );
      expect((await startDraw(jsonRequest({ name: "Повторная" }))).status).toBe(
        400,
      );
      expect(
        (await db.select().from(schema.assignment))
          .map((g) => [g.giverId, g.receiverId, g.revealToken])
          .sort(),
      ).toEqual([...edges].sort());
    }, 180_000);
    it("schedules, cancels and executes a due draw only once", async () => {
      const scheduled = await startDraw(
        jsonRequest({
          name: "По расписанию",
          scheduledAt: "2099-11-17T09:00:00Z",
        }),
      );
      expect(scheduled.status).toBe(201);
      const payload = await scheduled.json();
      expect(payload.scheduled).toBe(true);
      expect(await runDueDraws()).toBe(0);
      expect(await db.select().from(schema.assignment)).toHaveLength(0);
      expect(
        (await cancelDraw(jsonRequest({ id: payload.draw.id }))).status,
      ).toBe(200);
      const pending = await draft();
      await db
        .update(schema.draw)
        .set({ scheduledAt: new Date("2020-01-01T00:00:00Z") })
        .where(eq(schema.draw.id, pending.id));
      expect(await runDueDraws()).toBe(1);
      expect(await runDueDraws()).toBe(0);
      expect(await db.select().from(schema.assignment)).toHaveLength(3);
    });
    it("rejects scheduling another draw after the event is already completed", async () => {
      await executeDraw(await draft());
      const response = await startDraw(
        jsonRequest({
          name: "Лишнее расписание",
          scheduledAt: "2099-11-17T09:00:00Z",
        }),
      );
      expect(response.status).toBe(400);
      expect(await db.select().from(schema.draw)).toHaveLength(1);
      expect(await db.select().from(schema.assignment)).toHaveLength(3);
    });
    it("serializes concurrent scheduling requests and permits a new launch only after cancellation", async () => {
      const requests = await Promise.all(
        Array.from({ length: 4 }, () =>
          startDraw(
            jsonRequest({
              name: "Одно расписание",
              scheduledAt: "2099-11-17T09:00:00Z",
            }),
          ),
        ),
      );
      expect(requests.filter((r) => r.status === 201)).toHaveLength(1);
      expect(requests.filter((r) => r.status === 400)).toHaveLength(3);
      const [scheduled] = await db.select().from(schema.draw);
      expect(await db.select().from(schema.draw)).toHaveLength(1);
      expect(await db.select().from(schema.assignment)).toHaveLength(0);
      expect(
        (await startDraw(jsonRequest({ name: "Сразу поверх расписания" })))
          .status,
      ).toBe(400);
      expect((await cancelDraw(jsonRequest({ id: scheduled.id }))).status).toBe(
        200,
      );
      expect(
        (await startDraw(jsonRequest({ name: "После отмены" }))).status,
      ).toBe(201);
      expect(await db.select().from(schema.assignment)).toHaveLength(3);
    });
    it.each([
      [
        "Рядом: только два человека",
        ["Уфа", "Уфа"],
        ["Склад", "Склад"],
        "local",
      ],
      [
        "Рядом: площадки разделены 2+1",
        ["Уфа", "Уфа", "Уфа"],
        ["Склад", "Склад", "Офис"],
        "local",
      ],
      [
        "Межгород: все из одного города",
        ["Уфа", "Уфа", "Уфа"],
        ["", "", ""],
        "country",
      ],
      [
        "Межгород: несовместимое распределение 2+1",
        ["Уфа", "Уфа", "Москва"],
        ["", "", ""],
        "country",
      ],
    ] as const)(
      "rejects incompatible rings without partial data: %s",
      async (_label, cities, sites, track) => {
        await db.delete(schema.participant);
        await db
          .insert(schema.participant)
          .values(
            cities.map((city, i) => ({
              name: `Проверочный Участник${i}`,
              city,
              site: sites[i],
              track,
              pickupPoint: track === "country" ? "ПВЗ проверки" : "",
              consentAt: new Date(),
            })),
          );
        for (const scheduledAt of [null, "2099-11-17T09:00:00Z"]) {
          const response = await startDraw(
            jsonRequest({ name: "Невозможный состав", scheduledAt }),
          );
          expect(response.status).toBe(400);
          expect(await db.select().from(schema.draw)).toHaveLength(0);
          expect(await db.select().from(schema.assignment)).toHaveLength(0);
          const snapshot = await getGarlandSnapshot(EVENT_DEFAULTS);
          expect(snapshot.phase).toBe("registration");
          expect(snapshot.summary).toMatchObject({
            total: cities.length,
            received: 0,
          });
        }
      },
    );
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
            profileRequest({
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
      const text = "Иванова Анна;;Уфа;Склад;;Рядом;;Чай";
      expect(
        (await importMembers(jsonRequest({ text, consentConfirmed: false })))
          .status,
      ).toBe(400);
      expect(
        (
          await importMembers(
            jsonRequest({
              text: "Петров Иван;;Томск;Склад;;Рядом;;Чай",
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
              text: `Сидоров Олег;;Уфа;Склад;;Рядом;;Чай\n${text}`,
              consentConfirmed: true,
            }),
          )
        ).status,
      ).toBe(400);
      expect((await db.select().from(schema.participant)).length).toBe(before);
    });
    it("rejects local profiles without a site without overwriting saved data", async () => {
      await config(true);
      state.actor = { id: "u1", role: "user" };
      const [before] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      state.participant = before;
      for (const site of [undefined, "", "   "]) {
        const response = await updateProfile(
          profileRequest({
            city: "Уфа",
            site,
            shift: "",
            track: "local",
            wishes: "Книги",
            pickupPoint: "",
            consent: true,
            reserveVolunteer: false,
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: "Для трека «Рядом» укажите площадку.",
        });
      }
      const [after] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      expect(after).toEqual(before);
    });
    it("rejects an entire import if a local participant has no site", async () => {
      await config(true);
      state.actor = { id: "admin", role: "admin" };
      const before = await db.select().from(schema.participant);
      const response = await importMembers(
        jsonRequest({
          text: "Сидоров Олег;;Уфа;Склад;;Рядом;;Книга\nИванова Анна;;Уфа;;;Рядом;;Чай",
          consentConfirmed: true,
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("Строка 2");
      expect(await db.select().from(schema.participant)).toEqual(before);
    });
    it("saves intercity profiles without sites or wishes and includes them in the draw", async () => {
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
          profileRequest({
            city: ["Уфа", "Томск", "Москва"][id - 1],
            ...(id === 1 ? {} : { site: "" }),
            shift: "",
            track: "country",
            ...(id === 1 ? {} : { wishes: id === 2 ? "" : "   " }),
            pickupPoint: "ПВЗ 15",
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
      expect(profiles.every((participant) => participant.wishes === "")).toBe(
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
    it("allows editing a submitted profile after enrollment closes and while a draw is scheduled", async () => {
      const pending = await draft();
      await db
        .update(schema.draw)
        .set({ scheduledAt: new Date("2099-11-17T09:00:00Z") })
        .where(eq(schema.draw.id, pending.id));
      const [before] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      state.actor = { id: "u1", role: "user" };
      state.participant = before;
      const response = await updateProfile(
        profileRequest({
          name: "Иванова Анна Сергеевна",
          city: "Томск",
          site: "",
          track: "country",
          pickupPoint: "ПВЗ 15, Томск",
          wishes: "",
          consent: true,
          reserveVolunteer: true,
        }),
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      const [saved] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      expect(saved).toMatchObject({
        name: "Иванова Анна Сергеевна",
        city: "Томск",
        track: "country",
        pickupPoint: "ПВЗ 15, Томск",
        wishes: "",
        reserveVolunteer: true,
        consentAt: before.consentAt,
      });
      expect(result.profile).toEqual({
        name: saved.name,
        city: saved.city,
        site: saved.site,
        shift: saved.shift,
        track: saved.track,
        pickupPoint: saved.pickupPoint,
        wishes: saved.wishes,
        reserveVolunteer: saved.reserveVolunteer,
        consentAt: saved.consentAt!.toISOString(),
      });
      expect(await db.select().from(schema.assignment)).toHaveLength(0);
    });
    it("allows withdrawal after enrollment closes but rejects rejoining from a stale session", async () => {
      const [before] = await db
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, 1));
      state.actor = { id: "u1", role: "user" };
      state.participant = before;
      const body = {
        city: "Уфа",
        site: "Склад",
        track: "local",
        consent: false,
      };
      expect((await updateProfile(profileRequest(body))).status).toBe(200);
      const response = await updateProfile(
        profileRequest({ ...body, consent: true }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("Приём анкет закрыт");
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, 1))
        )[0].consentAt,
      ).toBeNull();
    });
    it("rejects a first opt-in while enrollment is closed", async () => {
      const [newcomer] = await db
        .insert(schema.participant)
        .values({ userId: "stranger", name: "Тестовый Новичок" })
        .returning();
      state.actor = { id: "stranger", role: "user" };
      state.participant = newcomer;
      const response = await updateProfile(
        profileRequest({
          city: "Уфа",
          site: "Склад",
          track: "local",
          consent: true,
        }),
      );
      expect(response.status).toBe(400);
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, newcomer.id))
        )[0],
      ).toEqual(newcomer);
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
      expect((await updateProfile(profileRequest(body))).status).toBe(200);
      await config(false);
      await executeDraw(await draft());
      expect(
        (await updateProfile(profileRequest({ ...body, city: "Томск" })))
          .status,
      ).toBe(400);
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, 1))
        )[0].city,
      ).toBe("Уфа");
      const [newcomer] = await db
        .insert(schema.participant)
        .values({ userId: "stranger", name: "Тестовый Новичок" })
        .returning();
      state.actor = { id: "stranger", role: "user" };
      state.participant = newcomer;
      const response = await updateProfile(
        profileRequest({ ...body, consent: false }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("После жеребьёвки");
      expect(
        (
          await db
            .select()
            .from(schema.participant)
            .where(eq(schema.participant.id, newcomer.id))
        )[0],
      ).toEqual(newcomer);
      expect(await db.select().from(schema.assignment)).toHaveLength(3);
    });
  },
);
