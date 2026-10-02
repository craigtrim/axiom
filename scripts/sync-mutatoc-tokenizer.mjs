// Copy only the native tokenizer's literal substitutions for source-position
// reconstruction. Matching and tokenization remain in the native engine.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const source = process.argv[2];
if (!source) throw Error("Supply the pinned Mutatoc source directory.");
const header = await readFile(path.join(source, "src/tokenize_data.h"), "utf8");
const api = await readFile(path.join(source, "include/mutatoc.h"), "utf8");
const version = api.match(/#define MUTATOC_VERSION "([^"]+)"/)?.[1];
if (version !== "0.3.1") throw Error("Expected Mutatoc 0.3.1 tokenizer data.");
const literal = '"(?:[^"\\\\]|\\\\.)*"';
function rows(name, count) {
  const body = header.match(
    new RegExp(`${name}\\[\\] = \\{([\\s\\S]*?)\\};`),
  )?.[1];
  if (!body) throw Error("Missing tokenizer table: " + name);
  const row = new RegExp(
    `\\{\\s*(${literal})\\s*,\\s*(${literal})${count === 3 ? `\\s*,\\s*(${literal}|NULL)` : ""}\\s*\\}`,
    "g",
  );
  const entries = [...body.matchAll(row)].map((match) =>
    match
      .slice(1)
      .map((value) => (value === "NULL" ? null : JSON.parse(value))),
  );
  if (entries.length !== (body.match(/\{/g) ?? []).length)
    throw Error("Unrecognized tokenizer data in " + name);
  return entries;
}
const data = {
  version,
  source:
    "https://github.com/craigtrim/mutatoc/blob/d173f21ec823d33dc8ebb3df66aec2b5b4197466/src/tokenize_data.h",
  sourceSha256: createHash("sha256").update(header).digest("hex"),
  contractions: Object.fromEntries(
    rows("contractions", 3).map(([word, ...words]) => [
      word,
      words.filter((word) => word !== null),
    ]),
  ),
  abbreviations: Object.fromEntries(rows("abbreviations", 2)),
};
await mkdir("src/main/data", { recursive: true });
await writeFile(
  "src/main/data/mutatoc-tokenizer.json",
  JSON.stringify(data, null, 2) + "\n",
);
console.log(
  `Mutatoc ${version}: ${Object.keys(data.contractions).length} contractions, ${Object.keys(data.abbreviations).length} abbreviations`,
);
