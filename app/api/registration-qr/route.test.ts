import { afterEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
vi.mock("@/lib/draw-runner", () => ({
  appBaseUrl: () => "https://santa.corp.test",
}));
import { GET } from "./route";
afterEach(() => vi.restoreAllMocks());
describe("local registration QR", () => {
  it("encodes only the configured registration URL and returns standalone SVG", async () => {
    const spy = vi.spyOn(QRCode, "toString");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(spy).toHaveBeenCalledWith(
      "https://santa.corp.test/signup",
      expect.objectContaining({ type: "svg", margin: 4 }),
    );
    const text = await response.text();
    expect(text).toContain("<svg");
    expect(text).toContain("<path");
    expect(text).not.toMatch(/<script|<image|https?:\/\/(?!www.w3.org)/);
  });
});
