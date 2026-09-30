import type { Snapshot } from "../shared/protocol";
import type { TextAnalysisDraft } from "../shared/text-analysis";
import type { TextEntityClassDraft } from "./text-analysis-session";

export interface ParentOption {
  iri?: string;
  label: string;
  group: string;
}
export function textParentOptions(
  entities: Snapshot["entities"],
  parents: TextEntityClassDraft["parents"],
  text: string,
  phrase: TextAnalysisDraft["parents"],
  suggested: { value: string }[],
  assistant: string,
): ParentOption[] {
  const key = (s: string) => s.trim().normalize("NFC").toLowerCase();
  const query = key(text);
  const classes = entities.filter((e) => ["Class", "Defined"].includes(e.kind));
  const byIri = new Map(classes.map((e) => [e.iri, e]));
  const used = new Set(parents.flatMap((p) => ("iri" in p ? [p.iri] : [])));
  const options: ParentOption[] = [];
  const add = (iri: string, group: string) => {
    const entity = byIri.get(iri);
    if (!entity || used.has(iri)) return;
    const label = entity.label || entity.name || iri;
    used.add(iri);
    if (!query || key(label).includes(query) || key(iri).includes(query))
      options.push({ iri, label, group });
  };
  for (const p of phrase) add(p.iri, "From the phrase");
  for (const p of suggested) add(p.value, "Suggested by " + assistant);
  let remaining = 8;
  for (const e of classes.sort((a, b) =>
    (a.label || a.name).localeCompare(b.label || b.name),
  )) {
    if (!remaining) break;
    const before = options.length;
    add(e.iri, "Existing classes");
    if (options.length > before) remaining--;
  }
  if (
    query &&
    !classes.some((e) => key(e.label || e.name) === query) &&
    !parents.some((p) => "create" in p && key(p.create.label) === query)
  )
    options.push({ label: text.trim(), group: "Create" });
  return options;
}

export function selectionContext(
  text: string,
  phrase: string,
  start = text.indexOf(phrase),
) {
  if (start < 0 || text.slice(start, start + phrase.length) !== phrase)
    return { before: "", after: "" };
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const end = start + phrase.length;
  const newline = text.indexOf("\n", end);
  return {
    before: text.slice(lineStart, start),
    after: text.slice(end, newline < 0 ? text.length : newline),
  };
}
