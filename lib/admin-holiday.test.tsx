import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "./event-config";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { AdminPanel } from "@/components/admin-panel";

const css = readFileSync(
  new URL("../app/admin-holiday.css", import.meta.url),
  "utf8",
);
const colors = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)].map((match) => [
    match[1],
    match[2],
  ]),
);
function luminance(hex: string) {
  const channels = [1, 3, 5].map((position) => {
    const channel = parseInt(hex.slice(position, position + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe("subtle holiday styling without changing organizer tools", () => {
  it("retains the four section controls, registration QR, search and Russian phone input", () => {
    const html = renderToStaticMarkup(
      <AdminPanel
        participants={[]}
        exclusions={[]}
        pairings={[]}
        users={[]}
        scopes={[]}
        eventConfig={EVENT_DEFAULTS}
        og={{ title: "Гирлянда", description: "", banner: "" }}
      />,
    );
    expect(html).toContain('class="admin-panel space-y-6"');
    expect(html).toContain('aria-label="Разделы кабинета организатора"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    for (const label of [
      "Участники",
      "Жеребьёвка",
      "Рассылка",
      "Настройки",
      "Поиск участника",
      "Телефон РФ",
    ])
      expect(html).toContain(label);
    for (const href of ["/garland", "/coordinator", "/signup"])
      expect(html).toContain(href);
    expect(html).toContain("Регистрация списком");
    expect(html).toContain("Исключения");
  });
  it("keeps the light theme scoped and the decoration non-interactive and static", () => {
    expect(colors.background).toBe("#faf8f2");
    expect(colors.card).toBe("#ffffff");
    expect(css).not.toMatch(
      /:root\s*\{|\bbody\s*\{|\.festive-shell|@keyframes/,
    );
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });
  it.each([
    ["foreground", "background"],
    ["primary-foreground", "primary"],
    ["muted-foreground", "card"],
    ["accent-foreground", "accent"],
  ])(
    "keeps normal text contrast at least 4.5:1: %s / %s",
    (foreground, background) => {
      const a = luminance(colors[foreground]);
      const b = luminance(colors[background]);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
