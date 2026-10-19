import * as monaco from "monaco-editor/editor/editor.api.js";
import {
  language as xml,
  conf as xmlConfiguration,
} from "monaco-editor/languages/definitions/xml/xml.js";
import { rdfTokens, rdfStrings } from "./sparql-language";
import type { SourceFormat } from "../shared/source";
window.MonacoEnvironment ??= {
  getWorker: () => new Worker(new URL("editor.worker.js", location.href)),
};
// craigtrim/axiom#111: register eagerly so static text uses the editor's XML grammar too.
monaco.languages.register({ id: "xml" });
monaco.languages.setMonarchTokensProvider("xml", xml);
monaco.languages.setLanguageConfiguration("xml", xmlConfiguration);
monaco.languages.register({ id: "ontology-turtle" });
monaco.languages.setMonarchTokensProvider("ontology-turtle", {
  unicode: true,
  tokenizer: {
    root: [
      [/\s+/, ""],
      ...rdfTokens,
      [/@(?:prefix|base)\b|\b(?:PREFIX|BASE|GRAPH|a|true|false)\b/, "keyword"],
      // Term previews also show the local part of a name without its prefix.
      [/[\p{L}_][\p{L}\p{N}_.-]*/u, "prefixed"],
      [/[{}()[\];,.]|\^\^/, "delimiter"],
    ],
    ...rdfStrings,
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
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "json-key"],
      [/"(?:[^"\\]|\\.)*(?:"|$)/, "string"],
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
