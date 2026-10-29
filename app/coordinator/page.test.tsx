import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EVENT_DEFAULTS } from "@/lib/event-config";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  select: vi.fn(),
  config: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("redirect:" + path);
  },
}));
vi.mock("@/lib/staff", () => ({
  staffAccess: mocks.access,
  managesSite: () => true,
}));
vi.mock("@/lib/db", async () => ({
  schema: await import("@/lib/db/schema"),
  db: { select: mocks.select },
  first: async () => undefined,
}));
vi.mock("@/lib/event-settings", () => ({ getEventConfig: mocks.config }));
vi.mock("@/components/member-import", () => ({
  MemberImport: () => <div>Регистрация списком</div>,
}));
import CoordinatorPage from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    admin: false,
    scopes: [{ city: "Москва", site: "Офис" }],
  });
  mocks.config.mockResolvedValue(EVENT_DEFAULTS);
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
describe("light festive coordinator cabinet with unchanged access", () => {
  it("uses the common shell and retains scoped navigation and filters", async () => {
    const html = renderToStaticMarkup(
      await CoordinatorPage({
        searchParams: Promise.resolve({ status: "late" }),
      }),
    );
    expect(html).toContain('class="admin-holiday holiday-theme"');
    expect(html.match(/class="admin-holiday-lights"/g)).toHaveLength(1);
    expect(html).toContain('id="coordinator-content"');
    expect(html).toContain("Москва, Офис");
    expect(html).toContain("Регистрация списком");
    const activeFilter = html.match(
      /<a\b[^>]*href="\/coordinator\?status=late"[^>]*>/,
    )?.[0];
    expect(activeFilter).toContain('aria-current="page"');
    expect(html).not.toContain('href="/admin"');
    expect(html).toContain('href="/#garland"');
    expect(html).not.toContain('href="/garland"');
  });
  it("redirects guests before fetching private data", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(
      CoordinatorPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/login");
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("redirects users without coordinator rights before fetching private data", async () => {
    mocks.access.mockResolvedValue({ admin: false, scopes: [] });
    await expect(
      CoordinatorPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/dashboard");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
