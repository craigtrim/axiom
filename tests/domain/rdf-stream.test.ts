// craigtrim/axiom#208: exercise chunk boundaries, final validation and owned imports.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseRdf,
  parseRdfFile,
  parseRdfStream,
  storeFromRdf,
  type RdfFormat,
} from "../../src/domain/rdf-io";
import { rdfTextChunks } from "../../src/domain/rdf-stream";
import { NS } from "../../src/domain/model";

const base = "https://example.org/";
const unicode = "Café 📚";
const xml = (value: string, dtd = "") => `${dtd}<rdf:RDF
  xmlns:rdf="${NS.rdf}" xmlns:ex="${base}">
  <rdf:Description rdf:about="${base}item">
    <ex:label xml:lang="fr">${value}</ex:label>
  </rdf:Description>
</rdf:RDF>`;
const fixtures: { format: RdfFormat; extension: string; text: string }[] = [
  {
    format: "turtle",
    extension: "ttl",
    text: `@prefix ex: <${base}>. ex:item ex:label "${unicode}"@fr.`,
  },
  { format: "rdfxml", extension: "rdf", text: xml(unicode) },
  {
    format: "ntriples",
    extension: "nt",
    text: `<${base}item> <${base}label> "${unicode}"@fr .`,
  },
  {
    format: "nquads",
    extension: "nq",
    text: `<${base}item> <${base}label> "${unicode}"@fr <${base}graph> .`,
  },
  {
    format: "trig",
    extension: "trig",
    text: `@prefix ex: <${base}>. ex:graph { ex:item ex:label "${unicode}"@fr. }`,
  },
  {
    format: "jsonld",
    extension: "jsonld",
    text: JSON.stringify({
      "@context": { ex: base },
      "@id": "ex:item",
      "ex:label": { "@value": unicode, "@language": "fr" },
    }),
  },
];
async function* bytes(text: string, size = 1) {
  const buffer = Buffer.from(text);
  for (let offset = 0; offset < buffer.length; offset += size)
    yield buffer.subarray(offset, offset + size);
}
async function* characters(text: string) {
  // Deliberately split UTF-16 surrogate pairs as well as XML and RDF tokens.
  for (let index = 0; index < text.length; index++) yield text[index];
}
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixtureFile(name: string, text: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "axiom-rdf-stream-"));
  directories.push(directory);
  const file = path.join(directory, name);
  await writeFile(file, text, "utf8");
  return file;
}

describe("streamed RDF imports", () => {
  it.each(fixtures)(
    "preserves $format terms across individual UTF-8 bytes",
    async ({ format, extension, text }) => {
      const expected = await parseRdf(text, `input.${extension}`, base, format);
      const result = await parseRdfStream(
        bytes(text),
        `input.${extension}`,
        base,
        format,
      );
      expect(result).toEqual(expected);
      expect(result.triples).toHaveLength(1);
      expect(result.triples[0].object).toEqual({
        value: unicode,
        literal: true,
        language: "fr",
        datatype: NS.rdf + "langString",
      });
      if (format === "trig" || format === "nquads")
        expect(result.triples[0].graph).toBe(base + "graph");
    },
  );

  it.each(fixtures)(
    "preserves $format terms across individual UTF-16 code units",
    async ({ format, extension, text }) => {
      const result = await parseRdfStream(
        characters(text),
        `input.${extension}`,
        base,
        format,
      );
      expect(result.triples[0].object.value).toBe(unicode);
    },
  );

  it.each(fixtures)(
    "reads $format files through the same parser",
    async ({ format, extension, text }) => {
      const file = await fixtureFile(`input.${extension}`, text);
      expect(await parseRdfFile(file, path.basename(file), base)).toEqual(
        await parseRdf(text, path.basename(file), base, format),
      );
    },
  );

  it.each([
    { name: "input.owl", text: fixtures[0].text, format: "turtle" },
    {
      name: "input.ttl",
      text: " ".repeat(70000) + xml(unicode),
      format: "rdfxml",
    },
    { name: "input.ttl", text: fixtures[5].text, format: "jsonld" },
  ])(
    "retains content detection for $format despite the filename",
    async ({ name, text, format }) => {
      const result = await parseRdfFile(
        await fixtureFile(name, text),
        name,
        base,
      );
      expect(result.format).toBe(format);
      expect(result.triples[0].object.value).toBe(unicode);
    },
  );

  it("keeps the first duplicate, named graphs and explicit blank identifiers", async () => {
    const text = `@prefix ex: <${base}>.
      ex:graph { _:shared ex:label "first"; ex:label "first"; ex:label "second". }
      _:shared ex:label "default".`;
    const result = await parseRdfStream(
      bytes(text, 3),
      "input.trig",
      base,
      "trig",
      { preserveBlankNodes: true },
    );
    expect(
      result.triples.map((statement) => [
        statement.subject,
        statement.object.value,
        statement.graph,
      ]),
    ).toEqual([
      ["_:shared", "first", base + "graph"],
      ["_:shared", "second", base + "graph"],
      ["_:shared", "default", undefined],
    ]);
  });

  it("retains the explicit empty-document option", async () => {
    await expect(
      parseRdfStream(bytes("# comment\n"), "input.ttl", base, "turtle"),
    ).rejects.toThrow("No RDF statements");
    expect(
      (
        await parseRdf("# comment\n", "input.ttl", base, "turtle", {
          allowEmpty: true,
        })
      ).triples,
    ).toEqual([]);
  });

  it("closes a failing input without returning its already parsed statements", async () => {
    let closed = false;
    async function* failingInput() {
      try {
        yield fixtures[0].text + "\n";
        throw Error("source read failed");
      } finally {
        closed = true;
      }
    }
    await expect(
      parseRdfStream(failingInput(), "input.ttl", base, "turtle"),
    ).rejects.toThrow("source read failed");
    expect(closed).toBe(true);
  });

  it.each([
    {
      format: "turtle" as const,
      text:
        fixtures[0].text +
        '\n<https://example.org/broken> <https://example.org/label> "unfinished',
    },
    {
      format: "rdfxml" as const,
      text: xml(unicode).replace("</rdf:RDF>", "<rdf:Description"),
    },
    { format: "jsonld" as const, text: fixtures[5].text.slice(0, -1) },
  ])("rejects late or unfinished $format input", async ({ format, text }) => {
    await expect(
      parseRdfStream(bytes(text, 7), "input", base, format),
    ).rejects.toThrow();
  });

  it("blocks remote JSON-LD contexts on the streamed path", async () => {
    const text = JSON.stringify({
      "@context": base + "remote.jsonld",
      "@id": base + "item",
    });
    await expect(
      parseRdfStream(bytes(text), "input.jsonld", base, "jsonld"),
    ).rejects.toThrow("Remote JSON-LD contexts are not loaded");
  });

  it("retains per-statement validation on the streamed path", async () => {
    const text = `<${base}item> <${base}label> "${"x".repeat(1000001)}" .`;
    await expect(
      parseRdfStream(bytes(text, 4096), "input.nt", base, "ntriples"),
    ).rejects.toThrow("Invalid RDF statement");
  });

  it("keeps decoder output bounded without splitting supplementary characters", async () => {
    const text = "x".repeat(65535) + "📚" + "y".repeat(65537);
    const chunks: string[] = [];
    for await (const chunk of rdfTextChunks([text])) chunks.push(chunk);
    expect(chunks.join("")).toBe(text);
    expect(
      Math.max(...chunks.map((chunk) => chunk.length)),
    ).toBeLessThanOrEqual(65536);
    expect(chunks.every((chunk) => !/[\ud800-\udbff]$/.test(chunk))).toBe(true);
  });

  it("clones caller data by default and can adopt a private parser result", async () => {
    const { triples } = await parseRdf(fixtures[0].text, "input.ttl", base);
    const copied = storeFromRdf(triples, "Copied");
    const adopted = storeFromRdf(triples, "Adopted", undefined, {
      takeOwnership: true,
    });
    expect(adopted.tbox).toBe(triples);
    triples[0].object.value = "changed outside copied store";
    expect(copied.tbox[0].object.value).toBe(unicode);
    expect(copied.tbox[0].object).not.toBe(triples[0].object);
  });
});

describe("incremental RDF/XML security and EOF validation", () => {
  it("expands guarded local entities across declaration and reference boundaries", async () => {
    const dtd = `<!DOCTYPE rdf:RDF [
      <!-- A comment containing ] > does not end the subset. -->
      <!ENTITY word "Café ]">
      <!ENTITY phrase "&word; &amp; &#x1F4DA;">
    ]>`;
    const result = await parseRdfStream(
      bytes(xml("&phrase;", dtd)),
      "input.rdf",
      base,
      "rdfxml",
    );
    expect(result.triples[0].object.value).toBe("Café ] & 📚");
  });

  it("leaves declaration-like text in comments and CDATA literal", async () => {
    const text = xml("<![CDATA[<!DOCTYPE fake [&unknown;]>]]>").replace(
      "<rdf:RDF",
      "<!-- <!DOCTYPE ignored SYSTEM 'file:///private'> -->\n<rdf:RDF",
    );
    const result = await parseRdfStream(
      bytes(text),
      "input.rdf",
      base,
      "rdfxml",
    );
    expect(result.triples[0].object.value).toBe("<!DOCTYPE fake [&unknown;]>");
  });

  it("does not resolve unused circular declarations", async () => {
    const dtd = '<!DOCTYPE rdf:RDF [<!ENTITY unused "&unused;">]>';
    expect(
      (
        await parseRdfStream(
          bytes(xml(unicode, dtd)),
          "input.rdf",
          base,
          "rdfxml",
        )
      ).triples[0].object.value,
    ).toBe(unicode);
  });

  it.each([
    {
      dtd: '<!DOCTYPE rdf:RDF SYSTEM "file:///private">',
      error: "External XML entities",
    },
    {
      dtd: '<!DOCTYPE rdf:RDF PUBLIC "public" "https://example.org/private">',
      error: "External XML entities",
    },
    {
      dtd: '<!DOCTYPE rdf:RDF [<!ENTITY % parameter "value">]>',
      error: "External XML entities",
    },
    {
      dtd: '<!DOCTYPE rdf:RDF [<!ENTITY word "&word;">]>',
      error: "Circular or deeply nested",
    },
    {
      dtd:
        "<!DOCTYPE rdf:RDF [" +
        Array.from(
          { length: 101 },
          (_, index) => `<!ENTITY e${index} "x">`,
        ).join("") +
        "]>",
      error: "declarations exceed",
    },
    {
      dtd: "<!DOCTYPE rdf:RDF [<!--" + "x".repeat(65536) + "-->]>",
      error: "declarations exceed",
    },
    {
      dtd:
        '<!DOCTYPE rdf:RDF [<!ENTITY e "' +
        "x".repeat(33000) +
        '"><!ENTITY word "&e;&e;">]>',
      error: "entity is too large",
    },
    {
      dtd:
        "<!DOCTYPE rdf:RDF [" +
        Array.from(
          { length: 12 },
          (_, index) =>
            `<!ENTITY ${index ? "e" + index : "word"} "&e${index + 1};">`,
        ).join("") +
        '<!ENTITY e12 "x">]>',
      error: "Circular or deeply nested",
    },
  ])("rejects guarded declarations: $error", async ({ dtd, error }) => {
    await expect(
      parseRdfStream(
        bytes(xml("&word;", dtd), 31),
        "input.rdf",
        base,
        "rdfxml",
      ),
    ).rejects.toThrow(error);
  });

  it.each([
    xml(unicode) + "<!DOCTYPE rdf:RDF>",
    "<!DOCTYPE rdf:RDF [<!ENTITY word 'unfinished'",
    xml(unicode).replace("</rdf:RDF>", ""),
  ])("validates XML through its final input chunk", async (text) => {
    await expect(
      parseRdfStream(bytes(text, 11), "input.rdf", base, "rdfxml"),
    ).rejects.toThrow("RDF/XML parse failed");
  });
});
