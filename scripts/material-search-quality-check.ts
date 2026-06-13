import { readFileSync } from "fs";
import { join } from "path";
import { normalizeMaterialSearchQuery } from "../src/modules/materials/search/material-search-normalizer";

type Sample = {
  query: string;
  normalized: Record<string, string>;
  positiveTitleIncludes: string[];
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const samples = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/material-search-quality-samples.json"),
    "utf8",
  ),
) as Sample[];
for (const sample of samples) {
  const normalized = normalizeMaterialSearchQuery({ q: sample.query });
  for (const [field, expected] of Object.entries(sample.normalized)) {
    assert(
      (normalized as Record<string, unknown>)[field] === expected,
      `${sample.query}: expected ${field}=${expected}, got ${(normalized as Record<string, unknown>)[field]}`,
    );
  }
  assert(
    normalized.q ===
      sample.query
        .normalize("NFKC")
        .replace(/[\u3000\s]+/g, " ")
        .trim(),
    `${sample.query}: q normalization drifted`,
  );
}
console.log(`material-search-quality-check passed (${samples.length} samples)`);
