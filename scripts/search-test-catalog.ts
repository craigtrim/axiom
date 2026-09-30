import { mkdir, writeFile } from "node:fs/promises";
import {
  aliasCases,
  lexicalCases,
  concepts,
} from "../tests/fixtures/search/catalog";
import { iri } from "../tests/fixtures/search/fixture";
import { normalizeSearchText } from "../src/domain/cosine";

// Generate review material from the same authored inputs, never from search results.
const cases = [...lexicalCases, ...aliasCases].map(
  ({ id, purpose, query, concept }) => ({
    id,
    purpose,
    query,
    preferredLabel: concept.label,
    alias: concept.alias,
    expectedFirstIri: iri(concept.localName),
    expectedIncludedIri: id.startsWith("LEX-")
      ? iri("Extended_" + concept.localName)
      : undefined,
    surfaces: ["Find", "class resource suggestions"],
  }),
);
const summary = {
  concepts: concepts.length,
  queryCases: cases.length,
  distinctQueryStrings: new Set(cases.map((c) => c.query)).size,
  distinctNormalizedQueries: new Set(
    cases.map((c) => normalizeSearchText(c.query)),
  ).size,
  preferredLabelCases: lexicalCases.length,
  aliasCases: aliasCases.length,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/search-query-catalog.json",
  JSON.stringify({ summary, cases }, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { path: "artifacts/search-query-catalog.json", ...summary },
    null,
    2,
  ),
);
