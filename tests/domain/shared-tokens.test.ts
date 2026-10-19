import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import postcss from "postcss";
import { sharedTokens } from "../../src/renderer/shared-tokens";

// Pin both the palette source and the remaining private owners (craigtrim/axiom#81).
const source = readFileSync(
  "tests/fixtures/design-system-visual/visual-reference.html",
);
// craigtrim/axiom#111: extend the palette without changing its pinned colours.
it("retains every reference token and adds shared syntax colours", () => {
  expect(createHash("sha256").update(source).digest("hex")).toBe(
    "076925d259b1ea221a227098f09680cd6f04c0cdb92376e9dfe47714433869e7",
  );
  const tokens = source.toString().split("\n").slice(49, 126).join("\n");
  const actual = postcss.parse(readFileSync("src/renderer/styles.css", "utf8"));
  postcss.parse(tokens).walkRules((rule) => {
    const matches: postcss.Rule[] = [];
    actual.walkRules(rule.selector, (candidate) => {
      if (
        candidate.nodes.some(
          (node) => node.type === "decl" && node.prop === "color-scheme",
        )
      )
        matches.push(candidate);
    });
    expect(matches).toHaveLength(1);
    const declarations = (r: postcss.Rule) =>
      r.nodes
        .filter(
          (node): node is postcss.Declaration =>
            node.type === "decl" && !node.prop.startsWith("--syntax-"),
        )
        .map((node) => [node.prop, node.value]);
    expect(declarations(matches[0])).toEqual(declarations(rule));
  });
  const names = new Set<string>();
  postcss.parse(tokens).walkDecls(/^--/, (d) => {
    names.add(d.prop.slice(2));
  });
  expect(names.size).toBe(44);
  for (const kind of [
    "keyword",
    "prefixed",
    "iri",
    "string",
    "language",
    "datatype",
    "number",
    "comment",
    "punctuation",
    "xml-tag",
    "xml-attribute",
    "json-key",
    "variable",
  ])
    names.add("syntax-" + kind);
  expect(sharedTokens).toEqual(names);
});
it("removes only equal duplicate declarations and retains deferred private palettes", () => {
  const declarations: { file: string; selector: string; name: string }[] = [];
  for (const file of readdirSync("src/renderer").filter((f) =>
    f.endsWith(".css"),
  )) {
    postcss
      .parse(readFileSync("src/renderer/" + file, "utf8"))
      .walkDecls(/^--/, (d) => {
        declarations.push({
          file,
          selector: d.parent?.type === "rule" ? d.parent.selector : "",
          name: d.prop,
        });
      });
  }
  // Suggestions and Find retain only their named private colors (#82, craigtrim/axiom#83).
  const prior = declarations.filter(
    (d) =>
      !d.name.startsWith("--syntax-") &&
      ![
        "suggestions-reference.css",
        "find-reference.css",
        "entity-extend.css",
        "text-analysis.css",
        "hierarchy-reference.css",
      ].includes(d.file),
  );
  expect(prior).toHaveLength(197);
  // craigtrim/axiom#91: Hierarchy adds only indentation geometry, never palette overrides.
  expect(
    new Set(
      declarations
        .filter((d) => d.file === "hierarchy-reference.css")
        .map((d) => d.name),
    ),
  ).toEqual(new Set(["--ind-step", "--ind-depth"]));
  // craigtrim/axiom#79 adds six editor tints per theme, not another palette.
  expect(
    new Set(
      declarations
        .filter((d) => d.file === "text-analysis.css")
        .map((d) => d.name),
    ),
  ).toEqual(
    new Set([
      "--ed-pad",
      "--hb",
      "--hr",
      ...Array.from({ length: 6 }, (_, i) => [
        `--h${i + 1}`,
        `--h${i + 1}r`,
      ]).flat(),
    ]),
  );
  expect(
    new Set(
      declarations
        .filter((d) =>
          ["find-reference.css", "entity-extend.css"].includes(d.file),
        )
        .map((d) => d.name),
    ),
  ).toEqual(new Set(["--accent-hover", "--accent-tint", "--ok-border"]));
  expect(
    new Set(
      declarations
        .filter((d) => d.file === "suggestions-reference.css")
        .map((d) => d.name),
    ),
  ).toEqual(
    new Set([
      "--accent-hover",
      "--ok-border",
      "--warn-border",
      "--idle-border",
      "--sp-8",
    ]),
  );
  // Issue 85 leaves only the four reference-specific Details tokens.
  expect(
    new Set(
      declarations.filter((d) => d.file === "details.css").map((d) => d.name),
    ),
  ).toEqual(
    new Set(["--accent-hover", "--accent-tint", "--idle-border", "--r-card"]),
  );
  // Issue #86 keeps only the Individuals warning and pinned-column tokens.
  expect(
    new Set(
      declarations
        .filter((d) => d.file === "individuals-reference.css")
        .map((d) => d.name),
    ),
  ).toEqual(new Set(["--warn-bg", "--warn-border", "--idle-border"]));
  expect(new Set(prior.map((d) => d.name)).size).toBe(95);
  const shared = declarations.filter(
    (d) => sharedTokens.has(d.name.slice(2)) && d.file !== "styles.css",
  );
  // Issue 87 removes the last shared override and gives document tabs their own height.
  expect(shared).toEqual([]);
  expect(
    new Set(
      declarations
        .filter((d) => d.file === "window-chrome.css")
        .map((d) => d.name),
    ),
  ).toEqual(
    new Set([
      "--chrome-press",
      "--rail",
      "--rail-icon",
      "--h-title",
      "--h-doc-tabs",
      "--h-status",
      "--w-rail",
    ]),
  );
});
