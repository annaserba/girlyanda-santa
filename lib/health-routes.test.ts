import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $client: { query: mocks.query } } }));
import { GET as live } from "@/app/api/health/liveness/route";
import { GET as ready } from "@/app/api/health/readiness/route";

beforeEach(() => vi.resetAllMocks());
describe("non-sensitive deployment health probes", () => {
  it("keeps liveness independent of the database", async () => {
    const response = await live();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("uses a bounded database query for readiness", async () => {
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const response = await ready();
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith({
      text: "SELECT 1",
      query_timeout: 2000,
    });
    expect(await response.json()).toEqual({ status: "ready" });
  });
  it("returns 503 without leaking credentials or errors", async () => {
    mocks.query.mockRejectedValue(
      new Error("postgresql://private:secret@host/db"),
    );
    const response = await ready();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"unavailable"}');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
