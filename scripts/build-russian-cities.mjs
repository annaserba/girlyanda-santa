import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regeneration only: runtime lookup is entirely offline. Pinned AOSP mirror of GeoNames.
const revision = "00e13dbce6f779fab32011c079eb860633d3721f";
const source = `https://android.googlesource.com/platform/external/geonames/+/${revision}/export/dump/cities1000.zip?format=TEXT`;
const output = process.argv[2];
if (!output) throw new Error("Pass an output JSON path (must not exist)");
const directory = await mkdtemp(join(tmpdir(), "santa-cities-"));
try {
  const encoded = execFileSync("curl", ["-fsSL", "--max-time", "45", source], {
    maxBuffer: 40_000_000,
  });
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  const archivePath = join(directory, "cities.zip");
  await writeFile(archivePath, archive);
  const text = execFileSync("unzip", ["-p", archivePath, "cities1000.txt"], {
    encoding: "utf8",
    maxBuffer: 100_000_000,
  });
  const cities = text
    .trim()
    .split("\n")
    .flatMap((line) => {
      const row = line.split("\t");
      if (row[8] !== "RU" || row[6] !== "P") return [];
      // Keep Cyrillic aliases only; foreign-language/historical aliases are not
      // resolved unless unique. IDs remain so ambiguous names never pick a row.
      const names = [
        ...new Set(
          [row[1], ...row[3].split(",")].filter((name) =>
            /^[А-Яа-яЁё][А-Яа-яЁё .()–—-]*$/u.test(name),
          ),
        ),
      ];
      if (!names.length) return [];
      const latitude = Number(row[4]);
      const longitude = Number(row[5]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        throw new Error(`Invalid coordinate for ${row[0]}`);
      return [{ id: Number(row[0]), names, latitude, longitude }];
    })
    .sort((a, b) => a.id - b.id);
  if (cities.length < 1000) throw new Error("Incomplete city source");
  const data = {
    source,
    revision,
    retrieved: new Date().toISOString().slice(0, 10),
    archiveSha256: createHash("sha256").update(archive).digest("hex"),
    attribution:
      "GeoNames (geonames.org), CC BY 4.0; RU populated-place subset, Cyrillic aliases only",
    license: "https://creativecommons.org/licenses/by/4.0/",
    cities,
  };
  await writeFile(output, `${JSON.stringify(data)}\n`, { flag: "wx" });
  console.log(
    JSON.stringify({ cities: cities.length, sha256: data.archiveSha256 }),
  );
} finally {
  // Only this script's unique temporary directory, never a workspace path.
  await rm(directory, { recursive: true, force: true });
}
