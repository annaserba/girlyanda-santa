import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanSiteName, searchSites } from "./work-sites";
import { SiteSelect } from "@/components/site-select";
import { SiteSettings } from "@/components/site-settings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const sites = [
  { id: 1, city: "Уфа", name: "Офис Север" },
  { id: 2, city: "Уфа", name: "Склад" },
  { id: 3, city: "Томск", name: "Офис Север" },
];

describe("city-scoped site search and selection", () => {
  it("searches without case, whitespace or ё/е differences, within the selected city", () => {
    expect(searchSites(sites, " УФА ", "ОФИС  СЕВЁР")).toEqual([sites[0]]);
    expect(searchSites(sites, "Томск", "офис")).toEqual([sites[2]]);
    expect(searchSites(sites, "Уфа", "неизвестная")).toEqual([]);
    expect(searchSites(sites, "Уфа")).toHaveLength(2);
    expect(cleanSiteName("  Офис\t  Север ")).toBe("Офис Север");
  });
  it.each([true, false])(
    "renders a named searchable field with required=%s",
    (required) => {
      const html = renderToStaticMarkup(
        <SiteSelect
          id="test-site"
          options={sites}
          city="Уфа"
          value="офис север"
          onChange={() => {}}
          required={required}
        />,
      );
      const trigger = html.match(/<button[^>]*id="test-site"[^>]*>/)?.[0];
      expect(trigger).toContain('role="combobox"');
      expect(trigger).toContain(`aria-required="${required}"`);
      expect(html).toContain("Офис Север");
      expect(html).toContain('name="site"');
      expect(html).toContain('value="офис север"');
    },
  );
  it("disables the field until a city is selected and when locked", () => {
    for (const props of [
      { city: "", disabled: false },
      { city: "Уфа", disabled: true },
    ]) {
      const html = renderToStaticMarkup(
        <SiteSelect options={sites} value="" onChange={() => {}} {...props} />,
      );
      expect(html.match(/<button[^>]*>/)?.[0]).toContain('disabled=""');
      expect(html.match(/<input[^>]*name="site"[^>]*>/)?.[0]).toContain(
        'disabled=""',
      );
    }
  });
  it("preserves a newly entered name until the profile is saved", () => {
    const html = renderToStaticMarkup(
      <SiteSelect
        city="Уфа"
        options={sites}
        value="Новый завод"
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Новый завод");
    expect(html).toContain('value="Новый завод"');
  });
  it("offers organizer rename and merge controls", () => {
    const html = renderToStaticMarkup(<SiteSettings sites={sites} />);
    expect(html).toContain("Переименовать");
    expect(html).toContain("Объединить");
    expect(html).toContain("Найти площадку");
    const mergeButtons = html.match(/<button[^>]*>Объединить<\/button>/g) ?? [];
    expect(mergeButtons).toHaveLength(3);
    expect(mergeButtons.filter((b) => b.includes('disabled=""'))).toHaveLength(
      1,
    );
  });
});
