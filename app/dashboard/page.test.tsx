import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "@/lib/event-config";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  participant: vi.fn(),
  admin: vi.fn(),
  staff: vi.fn(),
  select: vi.fn(),
  config: vi.fn(),
  history: vi.fn(),
  pairings: vi.fn(),
  sites: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("redirect:" + path);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: mocks.user,
  getOrCreateParticipant: mocks.participant,
  isAdmin: mocks.admin,
}));
vi.mock("@/lib/db", async () => ({
  schema: await import("@/lib/db/schema"),
  db: { select: mocks.select },
  first: async () => undefined,
}));
vi.mock("@/lib/staff", () => ({ staffAccess: mocks.staff }));
vi.mock("@/lib/event-settings", () => ({ getEventConfig: mocks.config }));
vi.mock("@/lib/sites", () => ({ getSiteOptions: mocks.sites }));
vi.mock("@/lib/pairings", () => ({
  getMyMatchHistory: mocks.history,
  getVisiblePairings: mocks.pairings,
}));
vi.mock("@/components/sign-out-button", () => ({
  SignOutButton: () => <button>Выйти</button>,
}));
vi.mock("@/components/participation-form", () => ({
  ParticipationForm: () => <form data-testid="existing-participation-form" />,
}));
vi.mock("@/components/wishlist-editor", () => ({
  WishlistEditor: () => <div data-testid="existing-wishlist" />,
}));
vi.mock("@/components/phone-editor", () => ({
  PhoneEditor: () => <div data-testid="existing-phone" />,
}));

import DashboardPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "u1", name: "Анна" });
  mocks.participant.mockResolvedValue({ id: 7, phone: "79991234567" });
  mocks.admin.mockResolvedValue(false);
  mocks.staff.mockResolvedValue({ admin: false, scopes: [] });
  mocks.config.mockResolvedValue(EVENT_DEFAULTS);
  mocks.sites.mockResolvedValue([]);
  mocks.history.mockResolvedValue([]);
  mocks.pairings.mockResolvedValue([]);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
  };
  for (const method of [query.from, query.where, query.orderBy, query.limit])
    method.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
});

describe("light festive participant cabinet with unchanged access", () => {
  it("shares the organizer theme while keeping forms and private account links", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('class="admin-holiday holiday-theme"');
    expect(html.match(/class="admin-holiday-lights"/g)).toHaveLength(1);
    expect(html).toContain("Здравствуйте, Анна!");
    expect(html).toContain('id="dashboard-content"');
    expect(html).toContain('data-testid="existing-participation-form"');
    expect(html).toContain('data-testid="existing-wishlist"');
    expect(html).toContain('data-testid="existing-phone"');
    expect(html).toContain('href="/#garland"');
    expect(html).not.toContain('href="/garland"');
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain('href="/coordinator"');
  });
  it("retains organizer and coordinator navigation for an administrator", async () => {
    mocks.admin.mockResolvedValue(true);
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/coordinator"');
    expect(html).toContain('href="/garland"');
  });
  it("redirects unauthenticated visitors before fetching private data", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("redirect:/login");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.participant).not.toHaveBeenCalled();
  });
});
