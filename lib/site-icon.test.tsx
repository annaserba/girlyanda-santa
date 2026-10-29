import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_ICONS } from "./site-icon";

const settings = {
  title: "Гирлянда Тайного Санты",
  description: "Обмен подарками",
  banner: "",
};
vi.mock("@/lib/settings", () => ({
  getOgSettings: async () => ({
    title: "Гирлянда Тайного Санты",
    description: "Обмен подарками",
    banner: "",
    // A leftover value from the old settings must not override the built-in icon.
    icon: "https://example.invalid/legacy-icon.png",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import manifest from "@/app/manifest";
import { generateMetadata } from "@/app/layout";
import { OgSettingsForm } from "@/components/og-settings";

describe("bundled generated site icon", () => {
  it("ships real local PNG files at all declared sizes", () => {
    for (const [url, size] of [
      [SITE_ICONS.favicon, 32],
      [SITE_ICONS.apple, 180],
      [SITE_ICONS.small, 192],
      [SITE_ICONS.large, 512],
    ] as const) {
      const png = readFileSync(new URL(`../public${url}`, import.meta.url));
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
        size,
        size,
      ]);
    }
    const original = readFileSync(
      new URL(`../public${SITE_ICONS.original}`, import.meta.url),
    );
    expect(original.readUInt32BE(16)).toBe(original.readUInt32BE(20));
    expect(original.readUInt32BE(16)).toBeGreaterThanOrEqual(512);
  });
  it("uses local browser and Apple icons regardless of legacy saved URLs", async () => {
    const metadata = await generateMetadata();
    expect(metadata.icons).toEqual({
      icon: [
        { url: SITE_ICONS.favicon, sizes: "32x32", type: "image/png" },
        { url: SITE_ICONS.small, sizes: "192x192", type: "image/png" },
      ],
      shortcut: SITE_ICONS.favicon,
      apple: { url: SITE_ICONS.apple, sizes: "180x180", type: "image/png" },
    });
    expect(JSON.stringify(metadata.icons)).not.toContain("example.invalid");
  });
  it("uses the same local artwork for installable app icons without unsafe maskable cropping", () => {
    expect(manifest().icons).toEqual([
      {
        src: SITE_ICONS.small,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: SITE_ICONS.large,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ]);
  });
  it("keeps the title and bundled icon without URL fields or a remote banner preview", () => {
    const html = renderToStaticMarkup(
      <OgSettingsForm
        initial={{
          ...settings,
          banner: "https://example.invalid/retired-banner.png",
        }}
      />,
    );
    expect(html).not.toContain("Ссылка на значок");
    expect(html).not.toContain("example.com/icon.png");
    expect(html).toContain(`src="${SITE_ICONS.small}"`);
    expect(html).not.toContain("Ссылка на изображение для предпросмотра");
    expect(html).not.toContain("example.invalid");
    expect(html).not.toContain(">Описание</label>");
    expect(html).not.toContain('value="Обмен подарками"');
    expect(html).not.toContain('type="url"');
  });
});
