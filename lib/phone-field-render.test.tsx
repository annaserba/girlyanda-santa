import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PhoneInput } from "@/components/phone-input";
import { HolidayShell } from "@/components/holiday-shell";

describe("rendered Russian phone field", () => {
  it("renders a disabled Russia selector, a labeled input and the fixed calling code", () => {
    const html = renderToStaticMarkup(
      <PhoneInput id="phone" value="79991234567" onChange={vi.fn()} required />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Россия \(\+7\)"/,
    );
    expect(html).toContain('id="phone"');
    expect(html).toContain('type="tel"');
    expect(html).toContain('aria-label="Телефон РФ"');
    expect(html).toContain('value="+7 999 123 45 67"');
    expect(html).not.toContain("Выбрать страну и телефонный код");
    expect(html).not.toContain("Поиск страны");
  });
  it.each(["", "79991234567"])(
    "keeps separate flag and editable phone controls in the signup theme: %s",
    (value) => {
      const html = renderToStaticMarkup(
        <HolidayShell auth contentId="signup-content">
          <main id="signup-content" className="holiday-auth-card">
            <PhoneInput id="phone" value={value} onChange={vi.fn()} required />
          </main>
        </HolidayShell>,
      );
      const country = html.match(
        /<button\b[^>]*class="[^"]*phone-country[^"]*"[^>]*>/,
      )?.[0];
      const number = html.match(
        /<input\b[^>]*class="[^"]*phone-number[^"]*"[^>]*>/,
      )?.[0];
      expect(country).toContain('disabled=""');
      expect(number).toContain('type="tel"');
      expect(number).not.toContain('disabled=""');
      expect(number).toContain('value="+7');
      expect(html).toContain('id="phone"');
    },
  );
  it("reserves 52px for the flag and lets the phone input fill the remainder", () => {
    const css = readFileSync(
      new URL("../app/admin-holiday.css", import.meta.url),
      "utf8",
    );
    const rule = (selector: string) =>
      css.slice(css.indexOf(selector)).split("}")[0];
    const country = rule(".holiday-theme .phone-field .phone-country");
    const number = rule(".holiday-theme .phone-field .phone-number");
    expect(country).toContain("flex: 0 0 52px");
    expect(country).toContain("width: 52px");
    expect(number).toContain("flex: 1 1 0%");
    expect(number).toContain("min-width: 0");
    expect(css).toContain('.holiday-auth-card button[type="submit"]');
    expect(css).not.toContain('.holiday-auth-card [data-slot="button"]');
  });
});
