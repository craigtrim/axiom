import * as monaco from "monaco-editor/editor/editor.api.js";

// craigtrim/axiom#111: editors, history and result previews share this grammar.
export const rdfTokens: monaco.languages.IMonarchLanguageRule[] = [
  [/#.*$/, "comment"],
  [/"""/, "string", "@longDouble"],
  [/'''/, "string", "@longSingle"],
  [/"(?:[^"\\]|\\.)*(?:"|$)/, "string"],
  [/'(?:[^'\\]|\\.)*(?:'|$)/, "string"],
  [
    /\^\^(?:<[^>]*(?:>|$)|(?:[\p{L}_][\p{L}\p{N}_.-]*)?:[^\s;,()\[\]{}"'<>]*)/u,
    "datatype",
  ],
  [/<[^<>\s]*>/, "iri"],
  [/<(?:[a-zA-Z_:/#][^<>\s]*)?$/, "iri"],
  // Inline identifiers are sometimes displayed without Turtle's angle brackets.
  [/(?:https?:\/\/|urn:)[^\s<>"']+/, "iri"],
  [/@(?:prefix|base)\b/i, "keyword"],
  [/@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*/, "language"],
  [
    /(?:[\p{L}_][\p{L}\p{N}_.-]*)?:(?:[^\s;,()\[\]{}"'<>.]|\.(?=[^\s;,()\[\]{}"'<>.]))*/u,
    "prefixed",
  ],
  [/[+-]?(?:(?:\d+\.\d*|\.\d+|\d+)[eE][+-]?\d+|\d*\.\d+|\d+)/, "number"],
];
export const rdfStrings: monaco.languages.IMonarchLanguage["tokenizer"] = {
  longDouble: [
    [/"""/, "string", "@pop"],
    [/\\./, "string"],
    [/[^"\\]+|./, "string"],
  ],
  longSingle: [
    [/'''/, "string", "@pop"],
    [/\\./, "string"],
    [/[^'\\]+|./, "string"],
  ],
};
monaco.languages.register({ id: "sparql" });
monaco.languages.setMonarchTokensProvider("sparql", {
  unicode: true,
  ignoreCase: true,
  keywords:
    "BASE PREFIX SELECT DISTINCT REDUCED AS CONSTRUCT DESCRIBE ASK FROM NAMED WHERE ORDER BY ASC DESC LIMIT OFFSET OPTIONAL GRAPH UNION FILTER A STR LANG LANGMATCHES DATATYPE BOUND IRI URI BNODE RAND ABS CEIL FLOOR ROUND CONCAT STRLEN UCASE LCASE ENCODE_FOR_URI CONTAINS STRSTARTS STRENDS STRBEFORE STRAFTER YEAR MONTH DAY HOURS MINUTES SECONDS TIMEZONE TZ NOW UUID STRUUID MD5 SHA1 SHA256 SHA384 SHA512 COALESCE IF STRLANG STRDT SAMETERM ISIRI ISURI ISBLANK ISLITERAL ISNUMERIC REGEX REPLACE SUBSTR EXISTS NOT IN SERVICE SILENT BIND VALUES UNDEF MINUS GROUP HAVING COUNT SUM MIN MAX AVG SAMPLE GROUP_CONCAT SEPARATOR TRUE FALSE INSERT DELETE DATA WITH USING DEFAULT ALL CLEAR CREATE DROP LOAD INTO ADD MOVE COPY TO".split(
      " ",
    ),
  tokenizer: {
    root: [
      [/\s+/, ""],
      ...rdfTokens,
      [/[?$][\p{L}\p{N}_]+/u, "variable"],
      [
        /[a-zA-Z_][\w-]*/,
        { cases: { "@keywords": "keyword", "@default": "" } },
      ],
      [/[{}()[\];,.]|[+*/=!<>|&^?-]/, "delimiter"],
    ],
    ...rdfStrings,
  },
});
