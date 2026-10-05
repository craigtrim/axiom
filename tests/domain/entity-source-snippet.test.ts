import { expect, it } from "vitest";
import {
  entitySourceSnippet,
  snippetSourceError,
} from "../../src/shared/entity-source-snippet";
import { sourceFormats } from "../../src/shared/source";
import { NS } from "../../src/domain/model";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import {
  entitySource,
  applyEntitySource,
} from "../../src/domain/entity-source";
import { sourceDocument } from "../../src/domain/source";

const base = "https://example.test/snippets#";
const turtle = `@prefix : <${base}> .
@prefix owl: <${NS.owl}> .
@prefix rdfs: <${NS.rdfs}> .
:A a owl:Class; rdfs:label "Alpha"@en;
 rdfs:comment "@prefix literal content stays visible";
 owl:equivalentClass [a owl:Class; owl:intersectionOf (:B :C)].
:B a owl:Class. :C a owl:Class.`;

it.each(sourceFormats)(
  "edits the displayed $id fragment with its original namespace context and Undo",
  async ({ id }) => {
    const store = storeFromRdf(
      (await parseRdf(turtle, "test.ttl", base)).triples,
      "Snippets",
      {
        fileName: "test",
        format: id,
        baseIRI: base,
        importedAt: "test",
      },
    );
    const before = structuredClone(store.tbox);
    const loaded = await entitySource(store, 1, base + "A");
    const snippet = entitySourceSnippet(loaded.text, loaded);
    expect(snippet.header + snippet.body + snippet.footer).toBe(loaded.text);
    expect(snippet.body).toContain("Alpha");
    expect(snippet.body).toContain("@prefix literal content stays visible");
    if (id === "turtle" || id === "trig") {
      expect(snippet.body).toMatch(/^:A\b/);
      expect(snippet.header).toContain("@prefix");
    } else if (id === "rdfxml") {
      expect(snippet.body.trimStart()).toMatch(/^<rdf:Description\b/);
      expect(snippet.body).not.toContain("<rdf:RDF");
      expect(snippet.header).toContain("<?xml");
      expect(snippet.footer).toContain("</rdf:RDF>");
    } else {
      expect(snippet.body).toBe(loaded.text);
    }
    const text =
      snippet.header + snippet.body.replace("Alpha", "Edited") + snippet.footer;
    // The saved draft still contains a complete document, including after reopening.
    expect(entitySourceSnippet(text, loaded).body).toContain("Edited");
    await applyEntitySource(store, 1, { ...loaded, text });
    expect(store.resolve(base + "A")?.label).toBe("Edited");
    const expression = store.resolve(base + "A")!.classExpressions![0].iri;
    expect(store.resolve(expression)?.intersection?.members).toEqual([
      base + "B",
      base + "C",
    ]);
    const full = await sourceDocument(store, 1, id);
    if (id === "turtle" || id === "trig") expect(full.text).toMatch(/^@prefix/);
    if (id === "rdfxml") expect(full.text).toMatch(/^<\?xml/);
    expect((await parseRdf(full.text, "full", base, id)).triples).toHaveLength(
      store.tbox.length,
    );
    store.undo();
    expect(store.tbox).toEqual(before);
  },
);

it.each(["\n", "\r\n"])(
  "hides leading prefix/base declarations with %j line endings without changing the document",
  (newline) => {
    const text = [
      "@base <https://example.test/> .",
      "@prefix : <https://example.test/> .",
      "PREFIX owl: <http://www.w3.org/2002/07/owl#>",
      "BASE <https://example.test/>",
      "",
      ":A a owl:Class .",
    ].join(newline);
    const snippet = entitySourceSnippet(text, { text, format: "trig" });
    expect(snippet.body).toBe(":A a owl:Class .");
    expect(snippet.header + snippet.body).toBe(text);
  },
);

it("keeps newly typed declarations visible and saves them with the original context", () => {
  const loaded = {
    text: '@prefix : <https://example.test/> .\n\n:A :p "old" .',
    format: "turtle" as const,
  };
  const snippet = entitySourceSnippet(loaded.text, loaded);
  const body = '@prefix extra: <https://extra.test/> .\n:A extra:p "new" .';
  expect(entitySourceSnippet(snippet.header + body, loaded).body).toBe(body);
});

it("retains edited namespace declarations from older saved drafts", () => {
  const loaded = {
    text: '@prefix : <https://old.test/> .\n:A :p "old" .',
    format: "turtle" as const,
  };
  const text = loaded.text.replace("old.test", "new.test");
  const snippet = entitySourceSnippet(text, loaded);
  expect(snippet.header).toContain("new.test");
  expect(snippet.body).toBe(':A :p "old" .');
  expect(snippet.header + snippet.body).toBe(text);
});

it.each([
  ':A :p """text\n@prefix : <https://literal.test/> .\n""" .',
  "@prefix incomplete",
  '# keep this comment\n:A :p "value" .',
  "",
])("preserves snippet content without a generated header: %s", (text) => {
  expect(entitySourceSnippet(text, { text, format: "turtle" })).toEqual({
    header: "",
    body: text,
    footer: "",
  });
});

it("reports Turtle parse errors using the visible snippet line numbers", async () => {
  const loaded = {
    text: '@prefix : <https://example.test/> .\n\n:A :p "value" .\n',
    format: "turtle" as const,
  };
  const snippet = entitySourceSnippet(loaded.text, loaded);
  const invalid = snippet.body + "invalid rdf {";
  try {
    await parseRdf(snippet.header + invalid, "test.ttl", base);
    expect.fail("Invalid source must be rejected");
  } catch (error) {
    expect(
      snippetSourceError((error as Error).message, {
        ...snippet,
        body: invalid,
      }),
    ).toMatch(/on line 2\b/);
  }
});

it.each([
  ["Line 8 column 4: invalid", "Line 3 column 4: invalid"],
  ["8:4: invalid", "3:4: invalid"],
  ["This entity changed.", "This entity changed."],
])(
  "maps XML errors without changing non-parser messages: %s",
  (message, expected) => {
    expect(
      snippetSourceError(message, {
        header: "\n".repeat(5),
        body: "one\ntwo\nthree",
        footer: "",
      }),
    ).toBe(expected);
  },
);
