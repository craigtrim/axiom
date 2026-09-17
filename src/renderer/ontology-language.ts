import * as monaco from "monaco-editor/editor/editor.api.js";
import "monaco-editor/languages/definitions/xml/register.js";
import type { SourceFormat } from "../shared/source";
window.MonacoEnvironment ??= {
  getWorker: () => new Worker(new URL("editor.worker.js", location.href)),
};
monaco.languages.register({ id: "ontology-turtle" });
monaco.languages.setMonarchTokensProvider("ontology-turtle", {
  unicode: true,
  tokenizer: {
    root: [
      [/#.*$/, "comment"],
      [/"""/, "string", "@longDouble"],
      [/'''/, "string", "@longSingle"],
      [/"(?:[^"\\]|\\.)*"/, "string"],
      [/'(?:[^'\\]|\\.)*'/, "string"],
      [/<[^>]*>/, "tag"],
      [/@(?:prefix|base)\b|\b(?:PREFIX|BASE|GRAPH|a|true|false)\b/, "keyword"],
      [/@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*/, "annotation"],
      [/(?:[\p{L}_][\p{L}\p{N}_.-]*)?:[^\s;,()\[\]{}]*/u, "type.identifier"],
      [/[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
      [/[{}()[\];,.]|\^\^/, "delimiter"],
    ],
    longDouble: [
      [/"""/, "string", "@pop"],
      [/\\./, "string.escape"],
      [/./, "string"],
    ],
    longSingle: [
      [/'''/, "string", "@pop"],
      [/\\./, "string.escape"],
      [/./, "string"],
    ],
  },
});
monaco.languages.setLanguageConfiguration("ontology-turtle", {
  comments: { lineComment: "#" },
  brackets: [
    ["[", "]"],
    ["(", ")"],
    ["{", "}"],
  ],
  autoClosingPairs: [
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "{", close: "}" },
  ],
});
monaco.languages.register({ id: "ontology-json" });
monaco.languages.setMonarchTokensProvider("ontology-json", {
  tokenizer: {
    root: [
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "string.key.json"],
      [/"(?:[^"\\]|\\.)*"/, "string.value.json"],
      [/\b(?:true|false|null)\b/, "keyword"],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
      [/[{}[\]:,]/, "delimiter"],
    ],
  },
});
export function ontologyLanguage(format?: SourceFormat) {
  return format === "rdfxml"
    ? "xml"
    : format === "jsonld"
      ? "ontology-json"
      : "ontology-turtle";
}
