import { canonical } from "./event-config";
import type { summarizeGifts } from "./garland-summary";

export interface AdminGarlandPerson {
  id: number;
  name: string;
  city: string;
  site: string;
  shift: string;
  track: "local" | "country" | null;
}
export interface AdminGarlandGift {
  giverId: number;
  receiverId: number;
  sent: boolean;
  received: boolean;
  reserveSent: boolean;
  reserveState: "none" | "requested" | "assigned" | "resolved";
}
export interface AdminGarlandSnapshot {
  phase: "registration" | "gifts";
  summary: ReturnType<typeof summarizeGifts>;
  people: AdminGarlandPerson[];
  gifts: AdminGarlandGift[];
}
export function adminCityKey(city: string) {
  return canonical(city) || "__unknown__";
}
export function filterAdminGarlandPeople(
  people: AdminGarlandPerson[],
  city: string,
  search: string,
) {
  const query = canonical(search);
  return people.filter(
    (p) =>
      (!city || adminCityKey(p.city) === city) &&
      canonical([p.name, p.site, p.shift, p.city].join(" ")).includes(query),
  );
}
