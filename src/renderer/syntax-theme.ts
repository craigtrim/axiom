import * as monaco from "monaco-editor/editor/editor.api.js";

// craigtrim/axiom#111: CSS owns the colours; every Monaco instance uses this theme.
export const syntaxKinds = [
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
] as const;
export type SyntaxKind = (typeof syntaxKinds)[number];
const tokens: Record<SyntaxKind, string[]> = {
  keyword: ["keyword"],
  prefixed: ["prefixed"],
  iri: ["iri"],
  string: ["string", "attribute.value.xml"],
  language: ["language"],
  datatype: ["datatype"],
  number: ["number"],
  comment: ["comment"],
  punctuation: ["delimiter"],
  "xml-tag": ["tag.xml", "metatag.xml"],
  "xml-attribute": ["attribute.name.xml"],
  "json-key": ["json-key"],
  variable: ["variable"],
};
export function syntaxKind(token: string): SyntaxKind | undefined {
  return syntaxKinds.find((kind) =>
    tokens[kind].some(
      (prefix) => token === prefix || token.startsWith(prefix + "."),
    ),
  );
}
const definitions = new Map<string, string>();
export function syntaxTheme(doc: Document = document) {
  const dark = doc.documentElement.dataset.theme === "dark";
  const name = dark ? "axiom-dark" : "axiom-light";
  const css = doc.defaultView!.getComputedStyle(doc.documentElement);
  const read = (variable: string) =>
    css.getPropertyValue("--" + variable).trim();
  const colours = syntaxKinds.map((kind) => read("syntax-" + kind));
  const signature = colours.join() + read("text");
  if (definitions.get(name) !== signature) {
    monaco.editor.defineTheme(name, {
      base: dark ? "vs-dark" : "vs",
      inherit: true,
      rules: [
        { token: "", foreground: read("text").slice(1), fontStyle: "" },
        ...syntaxKinds.flatMap((kind, i) =>
          tokens[kind].map((token) => ({
            token,
            foreground: colours[i].slice(1),
            fontStyle: "",
          })),
        ),
      ],
      colors: { "editor.foreground": read("text") },
    });
    definitions.set(name, signature);
  }
  return name;
}
