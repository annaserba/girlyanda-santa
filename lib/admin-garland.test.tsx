import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filterAdminGarlandPeople,
  adminCityKey,
  type AdminGarlandSnapshot,
} from "./admin-garland";
import { EVENT_DEFAULTS } from "./event-config";
import { summarizeGifts } from "./garland-summary";
import { AdminGarlandOverview } from "@/components/admin-garland-overview";
import { GarlandOverview } from "@/components/garland-overview";

const people: AdminGarlandSnapshot["people"] = [
  {
    id: 1,
    name: "Иванова Анна",
    city: "Уфа",
    site: "Склад",
    shift: "",
    track: "local",
  },
  {
    id: 2,
    name: "Петров Иван",
    city: "Уфа",
    site: "Склад",
    shift: "",
    track: "local",
  },
  {
    id: 3,
    name: "Сидоров Олег",
    city: "Уфа",
    site: "Офис",
    shift: "",
    track: "local",
  },
  {
    id: 4,
    name: "Тестовый Участник",
    city: "",
    site: "",
    shift: "",
    track: "country",
  },
];
const snapshot: AdminGarlandSnapshot = {
  phase: "gifts",
  people: people.slice(0, 3),
  gifts: [
    {
      giverId: 1,
      receiverId: 2,
      sent: true,
      received: true,
      reserveSent: false,
      reserveState: "none",
    },
    {
      giverId: 2,
      receiverId: 3,
      sent: false,
      received: false,
      reserveSent: true,
      reserveState: "assigned",
    },
    {
      giverId: 3,
      receiverId: 1,
      sent: false,
      received: false,
      reserveSent: false,
      reserveState: "none",
    },
  ],
  summary: summarizeGifts(
    people
      .slice(0, 3)
      .map((p) => ({
        city: p.city,
        site: p.site,
        receivedAt: p.id === 2 ? new Date() : null,
      })),
    EVENT_DEFAULTS,
  ),
};
describe("personal map inspection and public-map separation", () => {
  it("filters all names and sites without case or ё/е differences", () => {
    expect(
      filterAdminGarlandPeople(people, adminCityKey("УФА"), "  ПЁТРОВ   ИВАН "),
    ).toEqual([people[1]]);
    expect(filterAdminGarlandPeople(people, "", "офис")).toEqual([people[2]]);
    expect(filterAdminGarlandPeople(people, adminCityKey(""), "")).toEqual([
      people[3],
    ]);
    expect(
      filterAdminGarlandPeople(people, adminCityKey("Москва"), ""),
    ).toEqual([]);
  });
  it("renders city selection, names, real pair labels and gift states for admins", () => {
    const html = renderToStaticMarkup(
      <AdminGarlandOverview snapshot={snapshot} config={EVENT_DEFAULTS} />,
    );
    for (const p of snapshot.people) expect(html).toContain(p.name);
    expect(html).toContain('data-admin-city="Уфа"');
    expect(html).toContain('href="#garland-participants"');
    expect(html).toContain("Получатель");
    expect(html).toContain("Санта");
    expect(html).toContain("Отправлен резервом");
    expect(html).toContain("Получен");
    expect(html).not.toContain("Тестовый Участник");
  });
  it("keeps the same summary anonymous when used on the home page", () => {
    const html = renderToStaticMarkup(
      <GarlandOverview
        snapshot={{ phase: snapshot.phase, summary: snapshot.summary }}
        config={EVENT_DEFAULTS}
      />,
    );
    for (const p of snapshot.people) expect(html).not.toContain(p.name);
    expect(html).not.toContain("data-admin-city");
    expect(html).not.toContain("Получатель");
  });
  it("paginates large lists rather than rendering every name", () => {
    const many = Array.from({ length: 120 }, (_, id) => ({
      ...people[0],
      id: id + 1,
      name: `Участник Фамилия-${id + 1}`,
    }));
    const html = renderToStaticMarkup(
      <AdminGarlandOverview
        snapshot={{ ...snapshot, people: many, gifts: [] }}
        config={EVENT_DEFAULTS}
      />,
    );
    expect(html.match(/<article/g)).toHaveLength(50);
    expect(html).toContain("Страница 1 из 3");
    expect(html).not.toContain("Фамилия-120");
  });
});
