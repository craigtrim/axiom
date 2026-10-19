// craigtrim/axiom#111: the installed XML grammar ships JavaScript without declarations.
declare module "monaco-editor/languages/definitions/xml/xml.js" {
  export const language: import("monaco-editor").languages.IMonarchLanguage;
  export const conf: import("monaco-editor").languages.LanguageConfiguration;
}
