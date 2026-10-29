import { describe, expect, it } from "vitest";
import {
  EVENT_DEFAULTS,
  canonical,
  eventConfigSchema,
  profileSchema,
  profileReady,
  participantNameSchema,
} from "./event-config";
import { parseMemberList } from "./import-members";
import { summarizeGifts } from "./garland-summary";
import { mayUpdateGift } from "./gift-rules";

const profile = {
  name: "Иванова Анна",
  city: "Уфа",
  site: "Склад",
  shift: "",
  track: "country",
  pickupPoint: "ПВЗ 15",
  wishes: "Чай",
  reserveVolunteer: false,
  consent: true,
};
describe("participation and importing", () => {
  it.each([
    "Иванова Анна",
    "Иванова Анна Сергеевна",
    "Ли Бо",
    "Anne-Marie Smith",
  ])("accepts full recipient names with an optional patronymic: %s", (name) => {
    expect(participantNameSchema.parse(name)).toBe(name);
  });
  it.each(["", "   ", "local_user", "Анна", undefined])(
    "requires a recipient's full name: %s",
    (name) => {
      expect(profileSchema.safeParse({ ...profile, name }).success).toBe(false);
      expect(profileReady({ ...profile, name: name ?? "" })).toBe(false);
    },
  );
  it("normalizes spacing without inventing a patronymic", () => {
    expect(participantNameSchema.parse("  Иванова   Анна  ")).toBe(
      "Иванова Анна",
    );
    expect(() => parseMemberList("Анна;;Уфа;Склад;;Рядом;;Книга")).toThrow(
      "ФИО",
    );
  });
  it("allows declining participation without providing a new full name", () => {
    expect(
      profileSchema.safeParse({ ...profile, name: "", consent: false }).success,
    ).toBe(true);
    expect(profileReady({ ...profile, name: "" })).toBe(false);
  });
  it.each(["", "   ", undefined])(
    "requires a site for a local profile: %s",
    (site) => {
      const result = profileSchema.safeParse({
        ...profile,
        track: "local",
        site,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0]).toMatchObject({
          path: ["site"],
          message: "Для трека «Рядом» укажите площадку.",
        });
      expect(
        profileReady({ ...profile, track: "local", site: site ?? "" }),
      ).toBe(false);
    },
  );
  it("allows an empty site for intercity profiles while retaining other requirements", () => {
    const parsed = profileSchema.parse({ ...profile, site: "   " });
    expect(parsed.site).toBe("");
    expect(profileReady(parsed)).toBe(true);
    expect(profileReady({ ...parsed, city: "" })).toBe(false);
    expect(profileReady({ ...parsed, wishes: "" })).toBe(true);
  });
  it("treats an omitted site as empty without dropping the other requirements", () => {
    const { site: _site, ...withoutSite } = profile;
    expect(profileSchema.parse(withoutSite).site).toBe("");
    expect(
      profileSchema.safeParse({ ...withoutSite, pickupPoint: "" }).success,
    ).toBe(false);
  });
  it("imports an intercity profile with no site and rejects a local one", () => {
    const [member] = parseMemberList(
      "Иванова Анна;;Уфа;;;Страна;ПВЗ 15;Люблю чай",
    );
    expect(member.site).toBe("");
    expect(profileReady(member)).toBe(true);
    expect(() =>
      parseMemberList("Иванова Анна;;Уфа;;;Рядом;;Люблю чай"),
    ).toThrow("площадку");
  });
  it("requires a pickup point for intercity but not local", () => {
    expect(
      profileSchema.safeParse({ ...profile, pickupPoint: "" }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...profile, track: "local", pickupPoint: "" })
        .success,
    ).toBe(true);
  });
  it("parses an eight-column coordinator list", () => {
    const list = parseMemberList(
      "Иванова Анна;;Уфа;Склад;;Рядом;;\nПетров Иван;i@corp.test;Томск;Офис;;Страна;ПВЗ 15;Книги",
    );
    expect(list).toHaveLength(2);
    expect(list[0].consent).toBe(true);
    expect(list[0].wishes).toBe("");
    expect(profileReady(list[0])).toBe(true);
    expect(list[1].track).toBe("country");
  });
  it("rejects malformed lines instead of shifting columns", () => {
    expect(() => parseMemberList("Иванова Анна;Уфа;Рядом")).toThrow("8 полей");
  });
  it("validates ordering of proposed dates", () => {
    expect(
      eventConfigSchema.safeParse({
        ...EVENT_DEFAULTS,
        sendDeadline: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(EVENT_DEFAULTS.ringPolicy).toBe("tracks");
  });
  it("normalizes place identities", () => {
    expect(canonical(" ОРЁЛ  Офис ")).toBe("орел офис");
  });
});
describe("gift authorization", () => {
  const nobody = {
    giver: false,
    receiver: false,
    giverStaff: false,
    receiverStaff: false,
    reserve: false,
  };
  it("never permits unrelated users to mutate gift states", () => {
    for (const action of [
      "sent",
      "received",
      "request_reserve",
      "assign_reserve",
      "reserve_sent",
    ] as const)
      expect(mayUpdateGift(action, nobody)).toBe(false);
  });
  it("does not let a giver light their recipient's bulb", () => {
    expect(mayUpdateGift("received", { ...nobody, giver: true })).toBe(false);
    expect(mayUpdateGift("received", { ...nobody, receiver: true })).toBe(true);
  });
  it("scopes coordinator rights separately to sender and recipient sites", () => {
    expect(mayUpdateGift("received", { ...nobody, giverStaff: true })).toBe(
      false,
    );
    expect(
      mayUpdateGift("assign_reserve", { ...nobody, receiverStaff: true }),
    ).toBe(true);
  });
  it("does not let a volunteer assign themselves", () => {
    expect(mayUpdateGift("assign_reserve", { ...nobody, reserve: true })).toBe(
      false,
    );
    expect(mayUpdateGift("reserve_sent", { ...nobody, reserve: true })).toBe(
      true,
    );
  });
});
describe("public aggregate", () => {
  it("counts received gifts only and emits no identity or delivery fields", () => {
    const snapshot = summarizeGifts(
      [
        { city: "Уфа", site: "Склад", receivedAt: null },
        { city: " УФА ", site: "Склад", receivedAt: new Date() },
      ],
      EVENT_DEFAULTS,
    );
    expect(snapshot.total).toBe(2);
    expect(snapshot.received).toBe(1);
    expect(snapshot.cities).toHaveLength(1);
    expect(snapshot.cities[0].location).toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(
      /phone|email|giver|receiver|pickup|userId|token/i,
    );
  });
});
