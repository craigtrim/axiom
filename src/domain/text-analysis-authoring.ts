import { NS, THING } from "./model";
import { namedClass } from "./class-expressions";
import { displayName } from "./rdf-model";
import type { Store, ClassCreation } from "./store";
import type {
  TextAnalysisDraft,
  TextAnalysisParent,
} from "../shared/text-analysis";

const words = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const key = (text: string) => words(text).join(" ");
const cache = new WeakMap<
  Store,
  { version: number; aliases: Map<string, Set<string>> }
>();
function aliases(store: Store) {
  let entry = cache.get(store);
  if (entry?.version === store.version) return entry.aliases;
  const values = new Map<string, Set<string>>();
  const add = (iri: string, label: string) => {
    const entity = store.entities.get(iri);
    if (!entity || !namedClass(entity) || iri.startsWith("_:")) return;
    const normalized = key(label);
    if (!normalized) return;
    const ids = values.get(normalized) ?? new Set<string>();
    ids.add(iri);
    values.set(normalized, ids);
  };
  for (const entity of store.entities.values()) {
    add(entity.iri, displayName(entity));
    add(entity.iri, entity.name);
  }
  for (const triple of store.scan()) {
    if (!triple.object.literal) continue;
    if (
      [NS.rdfs + "label", NS.rdfs + "seeAlso", NS.skos + "altLabel"].includes(
        triple.predicate,
      ) ||
      triple.predicate.slice(triple.predicate.lastIndexOf("#") + 1) ===
        "inflection"
    ) {
      // Commas separate aliases in Mutato. Plus rules describe a gapped match,
      // not a literal class name, so do not treat them as duplicate names.
      for (const alias of triple.object.value.split(","))
        if (!alias.includes("+")) add(triple.subject, alias);
    }
  }
  entry = { version: store.version, aliases: values };
  cache.set(store, entry);
  return values;
}
export function textAnalysisDraft(
  store: Store,
  input: string,
  datasetEpoch: number,
): TextAnalysisDraft {
  const label = input.replace(/\s+/gu, " ").trim();
  const error = store.validateName(label);
  if (error) throw Error(error);
  const terms = words(label),
    index = aliases(store);
  const existing = [...(index.get(terms.join(" ")) ?? [])].map((iri) => ({
    iri,
    label: store.label(iri),
  }));
  const candidates = new Map<
    string,
    TextAnalysisParent & { length: number; suffix: boolean }
  >();
  for (let start = 0; start < terms.length; start++) {
    for (let end = start + 1; end <= terms.length; end++) {
      if (start === 0 && end === terms.length) continue;
      const matchedText = terms.slice(start, end).join(" ");
      for (const iri of index.get(matchedText) ?? []) {
        if (iri === THING || existing.some((entity) => entity.iri === iri))
          continue;
        const candidate = {
          iri,
          label: store.label(iri),
          matchedText,
          length: end - start,
          suffix: end === terms.length,
        };
        const previous = candidates.get(iri);
        if (
          !previous ||
          candidate.length > previous.length ||
          (candidate.length === previous.length && candidate.suffix)
        )
          candidates.set(iri, candidate);
      }
    }
  }
  const parents = [...candidates.values()]
    .sort(
      (a, b) =>
        b.length - a.length ||
        Number(b.suffix) - Number(a.suffix) ||
        a.label.localeCompare(b.label) ||
        a.iri.localeCompare(b.iri),
    )
    .map(({ iri, label, matchedText }) => ({ iri, label, matchedText }));
  return {
    label,
    parents,
    existing,
    defaultParent: parents[0]?.iri ?? THING,
    datasetEpoch,
    version: store.version,
  };
}
/** Validate the complete nested draft before submitting a single store edit. */
export function createTextAnalysisHierarchy(
  store: Store,
  input: unknown,
): string {
  const queue: { value: unknown; id: string }[] = [{ value: input, id: "0" }];
  const classes: ClassCreation[] = [],
    names = new Set<string>(),
    objects = new Set<object>();
  for (let at = 0; at < queue.length; at++) {
    if (queue.length > 1000)
      throw Error("Add no more than 1,000 classes at a time.");
    const { value, id } = queue[at];
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid class draft.");
    if (objects.has(value))
      throw Error(
        "A class cannot be its own ancestor or appear twice in an addition.",
      );
    objects.add(value);
    const item = value as Record<string, unknown>;
    if (
      typeof item.label !== "string" ||
      item.label.length > 256 ||
      typeof item.comment !== "string" ||
      item.comment.length > 10000 ||
      !Array.isArray(item.parents) ||
      !item.parents.length ||
      item.parents.length > 1000
    )
      throw Error("Provide a class name, description and at least one parent.");
    const draft = textAnalysisDraft(store, item.label, 0);
    if (draft.existing.length)
      throw Error(
        `“${draft.label}” already names an existing class. Choose the existing entry or change the name.`,
      );
    const normalized =
      key(draft.label) || draft.label.normalize("NFKC").toLowerCase();
    if (names.has(normalized))
      throw Error(
        `“${draft.label}” appears more than once in this addition. Give new classes distinct names.`,
      );
    names.add(normalized);
    const parents: ClassCreation["parents"] = [];
    for (const ref of item.parents) {
      if (!ref || typeof ref !== "object" || Array.isArray(ref))
        throw Error("Invalid parent choice.");
      if (
        "iri" in ref &&
        !("create" in ref) &&
        typeof ref.iri === "string" &&
        ref.iri.length <= 10000
      )
        parents.push({ iri: ref.iri });
      else if ("create" in ref && !("iri" in ref)) {
        const parentId = String(queue.length);
        queue.push({ value: ref.create, id: parentId });
        parents.push({ id: parentId });
      } else throw Error("Choose an existing parent or create a new parent.");
    }
    classes.push({ id, name: draft.label, comment: item.comment, parents });
  }
  return store.createClassHierarchy(classes).get("0")!;
}
export function createTextAnalysisClass(
  store: Store,
  label: string,
  parent: string | string[],
  comment = "",
) {
  return createTextAnalysisHierarchy(store, {
    label,
    comment,
    parents: (Array.isArray(parent) ? parent : [parent]).map((iri) => ({
      iri,
    })),
  });
}
