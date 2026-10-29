import { afterEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { GET } from "./route";
afterEach(() => vi.restoreAllMocks());
describe("local registration QR", () => {
  it("uses the browser origin behind a proxy and returns standalone SVG", async () => {
    const spy = vi.spyOn(QRCode, "toString");
    const response = await GET(
      new Request(
        "http://internal-app:3000/api/registration-qr?origin=" +
          encodeURIComponent("https://santa.corp.test"),
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(spy).toHaveBeenCalledWith(
      "https://santa.corp.test/signup",
      expect.objectContaining({ type: "svg", margin: 4 }),
    );
    const text = await response.text();
    expect(text).toContain("<svg");
    expect(text).toContain("<path");
    expect(text).not.toMatch(/<script|<image|https?:\/\/(?!www.w3.org)/);
  });
  it("preserves a direct site's protocol and non-default port", async () => {
    const spy = vi.spyOn(QRCode, "toString");
    await GET(new Request("http://santa.internal:8080/api/registration-qr"));
    expect(spy).toHaveBeenCalledWith(
      "http://santa.internal:8080/signup",
      expect.anything(),
    );
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "https://name:password@santa.corp.test",
    "https://santa.corp.test/other",
    "https://santa.corp.test?redirect=other",
    "https://santa.corp.test#other",
    "not-a-url",
  ])("rejects a value that is not an HTTP(S) origin: %s", async (origin) => {
    const spy = vi.spyOn(QRCode, "toString");
    const response = await GET(
      new Request(
        "http://internal-app:3000/api/registration-qr?origin=" +
          encodeURIComponent(origin),
      ),
    );
    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
