import { describe, expect, it } from "vitest";
import {
  cyclesOf,
  runGarlandDraw,
  trackAllows,
  type GarlandMember,
} from "./garland-draw";

function member(
  id: number,
  city = "Уфа",
  track: "local" | "country" = "local",
  site = "Площадка",
): GarlandMember {
  return { id, name: `Участник ${id}`, city, site, shift: "", track };
}
function check(members: GarlandMember[], pairs: Map<number, number>) {
  expect(pairs.size).toBe(members.length);
  expect(new Set(pairs.values()).size).toBe(members.length);
  const people = new Map(members.map((m) => [m.id, m]));
  for (const [g, r] of pairs) {
    expect(g).not.toBe(r);
    expect(pairs.get(r)).not.toBe(g);
    expect(trackAllows(people.get(g)!, people.get(r)!)).toBe(true);
  }
}
describe("garland rings", () => {
  it("draws city groups without a site while keeping named sites and other cities separate", () => {
    const members = [
      ...[1, 2, 3].map((id) => member(id, "Уфа", "local", "")),
      ...[4, 5, 6].map((id) => member(id, "Уфа", "local", "Офис")),
      ...[7, 8, 9].map((id) => member(id, "Томск", "local", "")),
    ];
    const result = runGarlandDraw(members, [], [], "tracks");
    check(members, result.pairs);
    expect(result.rings).toBe(3);
    expect(cyclesOf(result.pairs).map((cycle) => cycle.length)).toEqual([
      3, 3, 3,
    ]);
  });
  it("allows intercity participants to omit their sites", () => {
    const members = [
      member(1, "Уфа", "country", ""),
      member(2, "Томск", "country", ""),
      member(3, "Москва", "country", ""),
    ];
    const result = runGarlandDraw(members, [], [], "tracks");
    check(members, result.pairs);
    expect(result.rings).toBe(1);
  });
  it("still requires at least three participants in a city group without a site", () => {
    expect(() =>
      runGarlandDraw(
        [member(1, "Уфа", "local", ""), member(2, "Уфа", "local", "")],
        [],
        [],
        "tracks",
      ),
    ).toThrow("без площадки: нужно минимум 3");
  });
  it("forms a single cycle without reciprocal pairs", () => {
    const members = Array.from({ length: 30 }, (_, i) => member(i + 1));
    for (let i = 0; i < 20; i++) {
      const { pairs } = runGarlandDraw(members);
      check(members, pairs);
      expect(cyclesOf(pairs)).toHaveLength(1);
    }
  });
  it("keeps local site rings separate from the intercity ring", () => {
    const members = [
      member(1),
      member(2),
      member(3),
      member(4, "Томск"),
      member(5, "Томск"),
      member(6, "Томск"),
      member(7, "Уфа", "country"),
      member(8, "Томск", "country"),
      member(9, "Сахалин", "country"),
    ];
    const result = runGarlandDraw(members, [], [], "tracks");
    check(members, result.pairs);
    expect(result.rings).toBe(3);
    expect(
      cyclesOf(result.pairs)
        .map((c) => c.length)
        .sort(),
    ).toEqual([3, 3, 3]);
  });
  it("rejects local groups of 1 or 2 instead of relaxing the track", () => {
    expect(() =>
      runGarlandDraw(
        [member(1), member(2), member(3, "Томск")],
        [],
        [],
        "tracks",
      ),
    ).toThrow("минимум 3");
  });
  it("does not merge distinct shifts", () => {
    const members = [1, 2, 3, 4, 5, 6].map((id) => ({
      ...member(id),
      shift: id < 4 ? "Первая" : "Вторая",
    }));
    const result = runGarlandDraw(members, [], [], "tracks");
    expect(result.rings).toBe(2);
    check(members, result.pairs);
  });
  it("rejects impossible intercity distributions", () => {
    expect(() =>
      runGarlandDraw(
        [
          member(1, "Уфа", "country"),
          member(2, "Уфа", "country"),
          member(3, "Томск", "country"),
        ],
        [],
        [],
        "tracks",
      ),
    ).toThrow("не удалось");
  });
  it("retains hard exclusions when history must be relaxed", () => {
    const members = [1, 2, 3, 4, 5].map((id) => member(id));
    const history = members.flatMap((g) =>
      members
        .filter((r) => g.id !== r.id)
        .map((r) => [g.id, r.id] as [number, number]),
    );
    const result = runGarlandDraw(members, [[1, 2]], history);
    check(members, result.pairs);
    expect(result.historyRelaxed).toBe(true);
    expect(result.pairs.get(1)).not.toBe(2);
    expect(result.pairs.get(2)).not.toBe(1);
  });
  it("normalizes case, whitespace and ё in group names", () => {
    const result = runGarlandDraw(
      [member(1, " Орёл "), member(2, "ОРЕЛ"), member(3, "Орёл")],
      [],
      [],
      "tracks",
    );
    expect(result.rings).toBe(1);
  });
  it("handles 1500 intercity participants without self or reciprocal assignments", () => {
    const members = Array.from({ length: 1500 }, (_, i) =>
      member(i + 1, `Город ${i % 20}`, "country"),
    );
    const start = performance.now();
    const result = runGarlandDraw(members, [], [], "tracks");
    check(members, result.pairs);
    expect(cyclesOf(result.pairs)).toHaveLength(1);
    console.info(
      `1500 participants: ${Math.round(performance.now() - start)} ms`,
    );
  }, 30000);
});
