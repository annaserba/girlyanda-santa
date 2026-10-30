import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("portable authentication address", () => {
  it.each(["http://santa.internal:3003", "https://santa.example.test"])(
    "uses the current site for login instead of the build-time address: %s",
    async (origin) => {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3003");
      vi.stubGlobal("window", { location: { origin } });
      const fetch = vi.fn().mockResolvedValue(
        new Response("null", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetch);
      const { authClient } = await import("./auth-client");
      await authClient.getSession();
      expect(String(fetch.mock.calls[0][0])).toBe(
        `${origin}/api/auth/get-session`,
      );
    },
  );
});
