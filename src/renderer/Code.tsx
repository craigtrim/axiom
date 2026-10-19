import { useLayoutEffect, useMemo, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import { ontologyLanguage } from "./ontology-language";
import { syntaxKind } from "./syntax-theme";
import { promptSegments } from "../shared/syntax-text";
import type { SourceFormat } from "../shared/source";
import { paintSyntax, type SyntaxRange } from "./syntax-paint";

export type CodeLanguage = SourceFormat | "sparql" | "json" | "prompt";
// craigtrim/axiom#111: use the registered Monarch grammar, with escaped React text.
export function Code({
  children,
  language = "turtle",
}: {
  children: string | string[];
  language?: CodeLanguage;
}) {
  const text = Array.isArray(children) ? children.join("") : children;
  const element = useRef<HTMLSpanElement>(null);
  const ranges = useMemo(() => {
    const result: SyntaxRange[] = [];
    let offset = 0;
    const segments =
      language === "prompt"
        ? promptSegments(text)
        : [{ text, json: language === "json" }];
    for (const segment of segments) {
      if (language === "prompt" && !segment.json) {
        offset += segment.text.length;
        continue;
      }
      const id = segment.json
        ? "ontology-json"
        : language === "sparql"
          ? "sparql"
          : ontologyLanguage(language as SourceFormat);
      const lines = segment.text.split(/\r\n|\r|\n/);
      const endings = segment.text.match(/\r\n|\r|\n/g) ?? [];
      monaco.editor.tokenize(segment.text, id).forEach((tokens, row) => {
        tokens.forEach((token, i) => {
          const kind = syntaxKind(token.type);
          if (kind)
            result.push({
              from: offset + token.offset,
              to: offset + (tokens[i + 1]?.offset ?? lines[row].length),
              kind,
            });
        });
        offset += lines[row].length + (endings[row]?.length ?? 0);
      });
    }
    return result;
  }, [text, language]);
  useLayoutEffect(() => paintSyntax(element.current!, ranges), [ranges]);
  return (
    <span ref={element} className="syntax-code" data-language={language}>
      {text}
    </span>
  );
}
