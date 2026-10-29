import { describe, expect, it } from "vitest";
import { buildBulkMailto, parseRecipients } from "./bulk-email";

describe("bulk email", () => {
  it("accepts Outlook-style pasted lists and deduplicates addresses", () => {
    expect(
      parseRecipients("IVAN@corp.local; anna+shift@corp.local,\nivan@corp.local"),
    ).toEqual({
      addresses: ["ivan@corp.local", "anna+shift@corp.local"],
      invalid: [],
    });
  });

  it("does not silently send a partial list when an address is invalid", () => {
    expect(buildBulkMailto("anna@corp.local; missing-address", "Тема", "Текст"))
      .toBeNull();
    expect(buildBulkMailto("", "Тема", "Текст")).toBeNull();
  });

  it("places everyone in BCC and preserves Russian text and plus addresses", () => {
    const url = new URL(buildBulkMailto(
      "ivan@corp.local; anna+shift@corp.local",
      "Гирлянда: подарок & сюрприз",
      "Здравствуйте!\nhttps://santa.corp.local/dashboard?from=mail&year=2026",
    )!);
    expect(url.pathname).toBe("");
    expect(url.searchParams.get("bcc"))
      .toBe("ivan@corp.local,anna+shift@corp.local");
    expect(url.searchParams.has("to")).toBe(false);
    expect(url.searchParams.has("cc")).toBe(false);
    expect(url.searchParams.get("subject"))
      .toBe("Гирлянда: подарок & сюрприз");
    expect(url.searchParams.get("body"))
      .toContain("\r\nhttps://santa.corp.local/dashboard?from=mail&year=2026");
  });

  it("keeps header-like input inside the subject and body fields", () => {
    const url = new URL(buildBulkMailto(
      "anna@corp.local",
      "Тема\r\nCc: other@corp.local",
      "Пожелание: &bcc=other@corp.local\nТекст",
    )!);
    expect([...url.searchParams.keys()]).toEqual(["bcc", "subject", "body"]);
    expect(url.searchParams.get("bcc")).toBe("anna@corp.local");
    expect(url.searchParams.get("subject")).not.toMatch(/[\r\n]/);
    expect(url.searchParams.get("body"))
      .toContain("&bcc=other@corp.local\r\nТекст");
  });

  it("includes all 1500 synthetic recipients in one message", () => {
    const addresses = Array.from({ length: 1500 }, (_, i) => `person${i}@corp.local`);
    const url = new URL(buildBulkMailto(addresses.join("; "), "Тема", "Общий текст")!);
    expect(url.searchParams.get("bcc")?.split(",")).toEqual(addresses);
    expect(url.searchParams.get("body")).toBe("Общий текст");
  });
});
