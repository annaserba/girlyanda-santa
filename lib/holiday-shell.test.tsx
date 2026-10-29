import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HolidayPageHeader, HolidayShell } from "@/components/holiday-shell";
import { FestiveShell } from "@/components/festive-shell";
import { useHolidayPortalClass } from "@/components/holiday-theme";

function Probe() {
  return <span data-testid="context" className={useHolidayPortalClass()} />;
}
describe("shared light cabinets and authentication shell", () => {
  it("renders one static decoration, a working skip target and a semantic main", () => {
    const html = renderToStaticMarkup(
      <HolidayShell contentId="content">
        <HolidayPageHeader
          title="Мой кабинет"
          icon={<span>Подарок</span>}
          actions={<a href="/dashboard">Кабинет</a>}
        />
        <main id="content">
          <Probe />
        </main>
      </HolidayShell>,
    );
    expect(html.match(/class="admin-holiday-lights"/g)).toHaveLength(1);
    expect(html).toContain('href="#content"');
    expect(html).toContain('<main id="content"');
    expect(html).toContain('aria-label="Навигация кабинета"');
    expect(html).toContain("holiday-theme holiday-portal");
    expect(html).not.toMatch(/<animate|<script|<iframe|(?:src|href)="https?:/);
  });
  it("does not activate the cabinet theme outside its provider", () => {
    expect(renderToStaticMarkup(<Probe />)).not.toContain("holiday-theme");
  });
  it("removes the corporate label but keeps public brand and navigation", () => {
    const html = renderToStaticMarkup(
      <FestiveShell signedIn={false} siteTitle="Гирлянда Тайного Санты">
        <p>Главная</p>
      </FestiveShell>,
    );
    expect(html).not.toContain("ГК ГСП");
    expect(html).toContain("Гирлянда Тайного Санты");
    expect(html).toContain('href="/login"');
    expect(html).toContain('class="festive-shell"');
    expect(html).not.toContain("holiday-theme");
  });
  it("keeps light theme rules local, with touch-sized fields and wrapping navigation", () => {
    const css = readFileSync("app/admin-holiday.css", "utf8");
    expect(css).toContain(".holiday-theme {");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("max-width: 460px");
    expect(css).toContain("min-height: calc(100svh - 120px)");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).not.toMatch(/:root\s*\{|\bbody\s*\{/);
  });
});
