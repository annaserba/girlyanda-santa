import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "@/lib/event-config";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  settings: vi.fn(),
  pairings: vi.fn(),
  config: vi.fn(),
  panel: vi.fn(),
  sites: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: mocks.user,
  isAdmin: mocks.admin,
}));
vi.mock("@/lib/db", async () => ({
  schema: await import("@/lib/db/schema"),
  db: { select: mocks.select },
}));
vi.mock("@/lib/settings", () => ({ getOgSettings: mocks.settings }));
vi.mock("@/lib/pairings", () => ({ getAllPairings: mocks.pairings }));
vi.mock("@/lib/event-settings", () => ({ getEventConfig: mocks.config }));
vi.mock("@/lib/sites", () => ({ getSiteOptions: mocks.sites }));
vi.mock("@/components/admin-panel", () => ({ AdminPanel: mocks.panel }));
import AdminPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "organizer", role: "admin" });
  mocks.admin.mockResolvedValue(true);
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockResolvedValue([]);
  mocks.settings.mockResolvedValue({
    title: "Гирлянда",
    description: "",
    banner: "",
  });
  mocks.pairings.mockResolvedValue([]);
  mocks.config.mockResolvedValue(EVENT_DEFAULTS);
  mocks.sites.mockResolvedValue([]);
  mocks.panel.mockReturnValue(<div data-testid="existing-admin-panel" />);
});

describe("light festive organizer page", () => {
  it("renders one quiet garland, the existing panel and account navigation", async () => {
    const html = renderToStaticMarkup(await AdminPage());
    expect(html).toContain('class="admin-holiday holiday-theme"');
    expect(html).toContain('class="admin-holiday-lights" aria-hidden="true"');
    expect(html.match(/class="admin-holiday-lights"/g)).toHaveLength(1);
    expect(html.match(/<ellipse/g)).toHaveLength(11);
    expect(html).toContain("Кабинет организатора");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="#admin-content"');
    expect(html).toContain('<main id="admin-content">');
    expect(html).toContain('data-testid="existing-admin-panel"');
    expect(html).not.toContain('class="festive-shell"');
    expect(html).not.toMatch(
      /<animate|<script|<iframe|(?:src|href)="https?:\/\//,
    );
    expect(mocks.panel.mock.lastCall?.[0]).toMatchObject({
      participants: [],
      users: [],
      exclusions: [],
      pairings: [],
      scopes: [],
      sites: [],
      eventConfig: EVENT_DEFAULTS,
    });
  });
  it("still redirects guests before fetching private data", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(AdminPage()).rejects.toThrow("redirect:/login");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.pairings).not.toHaveBeenCalled();
  });
  it("still redirects non-organizers before fetching private data", async () => {
    mocks.admin.mockResolvedValue(false);
    await expect(AdminPage()).rejects.toThrow("redirect:/dashboard");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.pairings).not.toHaveBeenCalled();
  });
});
