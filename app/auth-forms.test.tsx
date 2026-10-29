import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({ signIn: { email: vi.fn() } }));
vi.mock("@/components/phone-input", () => ({
  PhoneInput: () => <input type="tel" />,
}));
import SignupPage from "./(auth)/signup/page";
import LoginPage from "./(auth)/login/page";

describe("personal and work email wording", () => {
  it("makes personal email explicitly acceptable at signup", () => {
    const html = renderToStaticMarkup(<SignupPage />);
    expect(html).toContain("Электронная почта");
    expect(html).toContain("личный или рабочий адрес");
    expect(html).not.toContain("Корпоративная почта");
    expect(html).toContain('type="email"');
    expect(html).toContain("Телефон РФ");
    expect(html).toContain('for="city"');
    expect(html.match(/<button[^>]*id="city"[^>]*>/)?.[0]).toContain(
      'role="combobox"',
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain("Выберите город РФ");
    expect(html).toContain('<input type="hidden" name="city" value=""');
  });
  it("uses the same neutral email label at login", () => {
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toContain("Электронная почта");
    expect(html).not.toContain("Корпоративная почта");
  });
  it.each([
    {
      Page: LoginPage,
      id: "login-content",
      title: "Вход",
      password: "current-password",
    },
    {
      Page: SignupPage,
      id: "signup-content",
      title: "Регистрация",
      password: "new-password",
    },
  ])(
    "uses the same light garland theme for $title",
    ({ Page, id, title, password }) => {
      const html = renderToStaticMarkup(<Page />);
      expect(html).toContain(
        'class="admin-holiday holiday-theme holiday-auth"',
      );
      expect(html.match(/class="admin-holiday-lights"/g)).toHaveLength(1);
      expect(html).toContain('href="#' + id + '"');
      expect(html).toContain('<main id="' + id + '"');
      expect(html).toContain("<h1>" + title + "</h1>");
      expect(html).toContain('autoComplete="' + password + '"');
      expect(html).toContain('type="email"');
      expect(html).toContain('aria-busy="false"');
      expect(html).not.toContain("ГК ГСП");
      expect(html).not.toMatch(/<script|<animate|<iframe/);
    },
  );
});
