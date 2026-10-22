import { NS, THING } from "./model";
import { textAnalysisDraft } from "./text-analysis-authoring";
import { entityNameKey } from "../shared/entity-names";
import {
  addEntityIri,
  addEntityPredicates,
  cleanEntityName,
  readAddEntityInput,
  type AddEntityCheck,
  type AddEntityNode,
  type AddEntityFinding,
} from "../shared/add-entity";
import type { Store, ClassCreation } from "./store";

// craigtrim/axiom#93: validate every drafted node before the single store transaction.
function inspect(store: Store, value: unknown, datasetEpoch: number) {
  const input = readAddEntityInput(value),
    findings: AddEntityFinding[] = [];
  const classes: ClassCreation[] = [],
    queue: AddEntityNode[] = [input.root];
  const names = new Set<string>(),
    iris = new Set<string>();
  let defaultParent = THING;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i],
      name = cleanEntityName(node.label),
      iri = addEntityIri(name, store.ontology.namespace);
    const bad = (message: string, reveal?: AddEntityFinding["reveal"]) =>
      findings.push({ kind: "bad2", message, reveal });
    let duplicate = false;
    if (!name)
      bad(
        i
          ? "A drafted parent needs a name."
          : "A name is required before this can be created.",
      );
    else {
      const draft = textAnalysisDraft(store, name, datasetEpoch);
      if (!i) defaultParent = draft.defaultParent;
      const existing = draft.existing[0];
      if (existing) {
        duplicate = true;
        bad(
          i
            ? `${name} now exists, so it cannot also be drafted.`
            : `A class named ${existing.label} already exists.`,
          i ? undefined : existing,
        );
      }
      if (
        !duplicate &&
        (store.exists(iri) ||
          store.bySubject.has(iri) ||
          store.byPredicate.has(iri) ||
          store.reverse.has(iri))
      ) {
        const kind = store.resolve(iri)?.kind;
        const noun =
          kind &&
          (
            {
              Class: "a class",
              Defined: "a class",
              Intersection: "a class",
              Individual: "an individual",
              ObjectProperty: "an object property",
              DataProperty: "a data property",
              AnnotationProperty: "an annotation property",
            } as Record<string, string>
          )[kind];
        bad(`${iri} is already occupied by ${noun || "an existing resource"}.`);
      }
      if (names.has(entityNameKey(name)) || iris.has(iri))
        bad(`${name} appears more than once in this draft.`);
      names.add(entityNameKey(name));
      iris.add(iri);
    }
    if (/[^\p{L}\p{N}\p{M}_\s]/u.test(name))
      findings.push({
        kind: "wrn2",
        message:
          "Characters other than letters, digits and underscores are left out of the IRI. The label keeps them exactly as typed.",
      });
    // Issue 157: ampersand normalization alone is not a whitespace warning.
    if (node.label.replace(/\s+/gu, " ").trim() !== node.label)
      findings.push({
        kind: "wrn2",
        message:
          "Leading, trailing or repeated whitespace is removed from the name before it becomes an IRI.",
      });
    const parents: ClassCreation["parents"] = node.parents.map((p) => {
      if ("iri" in p) return { iri: p.iri };
      const id = String(queue.length);
      queue.push(p.create);
      return { id };
    });
    const kind = i === 0 ? input.kind : "class";
    if (!parents.length && kind === "class") parents.push({ iri: THING });
    const statements = (node.statements ?? [])
      .filter((s) => s.object.value.trim())
      .map((s) => ({
        ...s,
        object: { ...s.object, value: s.object.value.trim() },
      }));
    if (statements.some((s) => !addEntityPredicates.includes(s.predicate)))
      bad("Choose an available additional-statement predicate.");
    classes.push({
      id: String(i),
      name,
      comment: node.comment,
      iri,
      parents,
      statements,
      kind,
      language: "en",
    });
  }
  if (!findings.some((f) => f.kind === "bad2")) {
    try {
      store.planClassHierarchy(classes);
    } catch (e) {
      findings.push({ kind: "bad2", message: (e as Error).message });
    }
  }
  return {
    classes,
    check: {
      findings,
      defaultParent,
      entityCount: store.entities.size,
      version: store.version,
      datasetEpoch,
    } satisfies AddEntityCheck,
  };
}
export function checkAddEntity(store: Store, value: unknown, epoch: number) {
  return inspect(store, value, epoch).check;
}
export function createAddEntity(store: Store, value: unknown, epoch: number) {
  const { classes, check } = inspect(store, value, epoch);
  const first = check.findings.find((f) => f.kind === "bad2");
  if (first) throw Error(first.message);
  const ids = store.createClassHierarchy(classes);
  return { iri: ids.get("0")!, created: [...ids.values()] };
}
