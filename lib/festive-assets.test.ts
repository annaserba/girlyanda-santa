import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("original festive presentation assets", () => {
  it.each(["gift-ring", "link", "send", "people", "globe"])(
    "bundles %s locally as a valid PNG",
    (name) => {
      const png = readFileSync(
        new URL(`../public/festive/${name}.png`, import.meta.url),
      );
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(256);
      expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(256);
    },
  );
});
