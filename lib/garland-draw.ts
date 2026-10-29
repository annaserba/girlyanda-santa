import { randomInt } from "node:crypto";
import { canonical, sameSite } from "./event-config";
import { DrawError } from "./draw";

export interface GarlandMember {
  id: number;
  name: string;
  city: string;
  site: string;
  shift: string;
  track: "local" | "country" | null;
}
type Pair = [number, number];
function shuffle<T>(input: T[]) {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function trackAllows(g: GarlandMember, r: GarlandMember) {
  if (g.id === r.id) return false;
  if (g.track === "country") return canonical(g.city) !== canonical(r.city);
  return (
    g.track === "local" &&
    sameSite(g, r) &&
    (!g.shift || canonical(g.shift) === canonical(r.shift))
  );
}
export function cyclesOf(pairs: Map<number, number>) {
  const unseen = new Set(pairs.keys());
  const cycles: number[][] = [];
  while (unseen.size) {
    const cycle: number[] = [];
    let id = unseen.values().next().value!;
    while (unseen.has(id)) {
      cycle.push(id);
      unseen.delete(id);
      id = pairs.get(id)!;
    }
    cycles.push(cycle);
  }
  return cycles;
}
/** Bounded matching followed by cycle-splicing. Never relaxes track or exclusions.
 * Search failure is reported as such, not as a proof of impossibility.
 */
function solveRing(
  members: GarlandMember[],
  forbidden: Set<string>,
  sameTrack: boolean,
): Map<number, number> | null {
  const n = members.length;
  const normalized = members.map((m) => ({
    ...m,
    city: canonical(m.city),
    site: canonical(m.site),
    shift: canonical(m.shift),
  }));
  const allowed = normalized.map((g) =>
    normalized.map(
      (r) =>
        g.id !== r.id &&
        (!sameTrack || g.track === r.track) &&
        (g.track === "country"
          ? g.city !== r.city
          : g.city === r.city &&
            g.site === r.site &&
            (!g.shift || g.shift === r.shift)) &&
        (!forbidden.size || !forbidden.has(`${g.id}:${r.id}`)),
    ),
  );
  if (allowed.some((row) => !row.some(Boolean))) return null;
  if (members.some((_, r) => !allowed.some((row) => row[r]))) return null;
  let probes = 0;
  const LIMIT = 15_000_000;
  for (let attempt = 0; attempt < 24 && probes < LIMIT; attempt++) {
    const candidates = allowed.map((row) =>
      shuffle(row.flatMap((ok, i) => (ok ? [i] : []))),
    );
    const receiverOwner = new Int32Array(n).fill(-1);
    function augment(g: number, seen: Uint8Array): boolean {
      for (const r of candidates[g]) {
        if (++probes > LIMIT) return false;
        if (!seen[r] && receiverOwner[r] === -1) {
          seen[r] = 1;
          receiverOwner[r] = g;
          return true;
        }
      }
      for (const r of candidates[g]) {
        if (++probes > LIMIT) return false;
        if (seen[r]) continue;
        seen[r] = 1;
        if (augment(receiverOwner[r], seen)) {
          receiverOwner[r] = g;
          return true;
        }
      }
      return false;
    }
    let matched = true;
    for (const g of shuffle(members.map((_, i) => i))) {
      if (!augment(g, new Uint8Array(n))) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const pairs = new Map<number, number>();
    receiverOwner.forEach((g, r) => pairs.set(g, r));
    let cycles = cyclesOf(pairs);
    while (cycles.length > 1 && probes < LIMIT) {
      let merged = false;
      outer: for (let i = 0; i < cycles.length; i++)
        for (let j = i + 1; j < cycles.length; j++) {
          for (const a of cycles[i])
            for (const b of cycles[j]) {
              if (++probes > LIMIT) break outer;
              const ar = pairs.get(a)!;
              const br = pairs.get(b)!;
              if (allowed[a][br] && allowed[b][ar]) {
                pairs.set(a, br);
                pairs.set(b, ar);
                merged = true;
                break outer;
              }
            }
        }
      if (!merged) break;
      cycles = cyclesOf(pairs);
    }
    if (cycles.length === 1)
      return new Map(
        [...pairs].map(([g, r]) => [members[g].id, members[r].id]),
      );
  }
  return null;
}
export function runGarlandDraw(
  members: GarlandMember[],
  exclusions: Pair[] = [],
  history: Pair[] = [],
  policy: "single" | "tracks" = "single",
) {
  if (members.length > 1500)
    throw new DrawError(
      "В этой версии поддерживается до 1500 участников одной гирлянды.",
    );
  if (new Set(members.map((m) => m.id)).size !== members.length)
    throw new DrawError("В списке есть повторяющиеся участники.");
  if (members.some((m) => !m.track || !m.city.trim()))
    throw new DrawError("Участники должны заполнить город и трек.");
  const groups = new Map<string, GarlandMember[]>();
  for (const m of members) {
    const key =
      policy === "single"
        ? "Все участники"
        : m.track === "country"
          ? "Межгород"
          : `Рядом: ${canonical(m.city)} / ${canonical(m.site)} / ${canonical(m.shift)}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  if (!groups.size)
    throw new DrawError("Нет подтверждённых анкет для жеребьёвки.");
  const hard = new Set(
    exclusions.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]),
  );
  const soft = new Set([...hard, ...history.map(([a, b]) => `${a}:${b}`)]);
  const pairs = new Map<number, number>();
  let historyRelaxed = false;
  for (const [name, group] of groups) {
    const label =
      policy === "tracks" && group[0].track === "local"
        ? `Рядом: ${group[0].city.trim()} / ${group[0].site.trim() || "без площадки"}${group[0].shift.trim() ? ` / ${group[0].shift.trim()}` : ""}`
        : name;
    if (group.length < 3)
      throw new DrawError(
        `${label}: нужно минимум 3 участника, иначе появится подарок себе или взаимная пара.`,
      );
    let solution = history.length
      ? solveRing(group, soft, policy === "tracks")
      : null;
    if (!solution) {
      solution = solveRing(group, hard, policy === "tracks");
      if (history.length) historyRelaxed = true;
    }
    if (!solution)
      throw new DrawError(
        `${label}: не удалось собрать кольцо с заданными городами, сменами и исключениями. Проверьте состав групп. Ограничения не ослаблены.`,
      );
    for (const [g, r] of solution) pairs.set(g, r);
  }
  return { pairs, rings: groups.size, historyRelaxed };
}
