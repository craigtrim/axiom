import type { SourceFormat } from "./source";

export interface EntitySourceSnippet {
  header: string;
  body: string;
  footer: string;
}

// Keep the complete document in drafts and IPC. Only the entity editor omits
// serialization headers; the full Source pane and exports remain self-contained.
function split(text: string, format?: SourceFormat): EntitySourceSnippet {
  let header = "",
    footer = "";
  if (format === "turtle" || format === "trig") {
    const directive =
      /^\s*(?:@prefix\s+[^\s:]*:\s*<[^>]*>\s*\.|@base\s+<[^>]*>\s*\.|PREFIX\s+[^\s:]*:\s*<[^>]*>|BASE\s+<[^>]*>)\s*/i;
    for (let match; (match = text.slice(header.length).match(directive));)
      header += match[0];
  } else if (format === "rdfxml") {
    // Only unwrap the serializer's document element, never an entity element.
    const start = text.match(
      /^\s*(?:<\?xml[^?]*\?>\s*)?<rdf:RDF\b(?:[^<>"']|"[^"]*"|'[^']*')*>(?:[ \t]*\r?\n)*/,
    );
    const end = text.match(/\s*<\/rdf:RDF>\s*$/);
    if (start && end && start[0].length + end[0].length <= text.length) {
      header = start[0];
      footer = end[0];
    }
  }
  return {
    header,
    body: text.slice(header.length, text.length - footer.length),
    footer,
  };
}

export function entitySourceSnippet(
  text: string,
  loaded: { text: string; format?: SourceFormat },
): EntitySourceSnippet {
  const frame = split(loaded.text, loaded.format);
  // Preserve the original frame while typing, including any new declarations
  // the user adds to the body. Older saved drafts may have edited their headers.
  if (
    text.startsWith(frame.header) &&
    text.endsWith(frame.footer) &&
    text.length >= frame.header.length + frame.footer.length
  )
    return {
      ...frame,
      body: text.slice(frame.header.length, text.length - frame.footer.length),
    };
  return split(text, loaded.format);
}

export function snippetSourceError(
  message: string,
  snippet: EntitySourceSnippet,
) {
  const offset = snippet.header.split("\n").length - 1;
  const line = (value: string) => String(Math.max(1, Number(value) - offset));
  return message
    .replace(/\bon line (\d+)\b/g, (_, value) => "on line " + line(value))
    .replace(
      /^Line (\d+) column /,
      (_, value) => "Line " + line(value) + " column ",
    )
    .replace(
      /^(\d+):(\d+):/,
      (_, value, column) => line(value) + ":" + column + ":",
    );
}
