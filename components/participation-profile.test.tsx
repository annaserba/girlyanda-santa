import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Participant } from "@/lib/db/schema";
import { ParticipationProfile } from "./participation-profile";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const participant: Participant = {
  id: 1,
  userId: "u1",
  name: "Иванова Анна Сергеевна",
  phone: null,
  email: "participant@example.test",
  city: "Уфа",
  site: "Офис",
  shift: "Дневная",
  track: "local",
  pickupPoint: "",
  wishes: "Чай\nБез сладкого",
  consentAt: new Date("2026-10-01T12:00:00Z"),
  reserveVolunteer: true,
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

describe("viewing a saved participation profile", () => {
  it("shows the submitted fields without an editable form and permits editing before the draw", () => {
    const html = renderToStaticMarkup(
      <ParticipationProfile participant={participant} locked={false} open />,
    );
    for (const value of [
      "Ваша анкета",
      "Участие подтверждено",
      participant.name,
      "Уфа",
      "Офис",
      "Дневная",
      "Рядом",
      "Чай\nБез сладкого",
      "Готов(а) помочь",
      "Редактировать анкету",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });
  it("still allows an opted-in participant to edit after new enrollment closes", () => {
    const html = renderToStaticMarkup(
      <ParticipationProfile
        participant={participant}
        locked={false}
        open={false}
      />,
    );
    expect(html).toContain("Редактировать анкету");
  });
  it("keeps the complete submitted profile visible after the draw without editing controls", () => {
    const html = renderToStaticMarkup(
      <ParticipationProfile
        participant={{
          ...participant,
          track: "country",
          site: "",
          wishes: "",
          pickupPoint: "ПВЗ 15, Уфа",
        }}
        locked
        open={false}
      />,
    );
    expect(html).toContain(participant.name);
    expect(html).toContain("Через всю страну");
    expect(html).toContain("ПВЗ 15, Уфа");
    expect(html).toContain("Не указаны");
    expect(html).toContain("Жеребьёвка проведена");
    expect(html).not.toContain("Редактировать анкету");
    expect(html).not.toContain("<form");
  });
  it("opens an empty participation form for a new participant while enrollment is open", () => {
    const html = renderToStaticMarkup(
      <ParticipationProfile
        participant={{ ...participant, track: null, consentAt: null }}
        locked={false}
        open
      />,
    );
    expect(html).toContain("<form");
    expect(html).toContain("Сохранить анкету");
    expect(html).not.toContain("Отменить изменения");
  });
  it("does not offer a new opt-in after enrollment closes", () => {
    const html = renderToStaticMarkup(
      <ParticipationProfile
        participant={{ ...participant, consentAt: null }}
        locked={false}
        open={false}
      />,
    );
    expect(html).toContain("Участие не подтверждено");
    expect(html).toContain(participant.name);
    expect(html).not.toContain("Редактировать анкету");
    expect(html).not.toContain("<form");
  });
});
