import { NS, SUBCLASS, THING, TYPE, type Triple } from "./model";
import { LABEL, displayName, statementKey } from "./rdf-model";
import { mergeEntityStatements } from "./entity-merge";
import { textAnalysisDraft } from "./text-analysis-authoring";
import { entityNameKey } from "../shared/entity-names";
import {
  addEntityIri,
  addEntityPredicates,
  cleanEntityName,
  readAddEntityInput,
  readAddEntityTarget,
  type AddEntityCheck,
  type AddEntityTarget,
  type AddEntityNode,
  type AddEntityFinding,
} from "../shared/add-entity";
import type { Store, ClassCreation } from "./store";

// craigtrim/axiom#93: validate every drafted node before the single store transaction.
// #169: preview permits an unnamed root; creation still validates it before writing.
function inspect(
  store: Store,
  value: unknown,
  datasetEpoch: number,
  requireRootName: boolean,
) {
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
    const bad = (
      message: string,
      reveal?: AddEntityFinding["reveal"],
      createOnly = false,
    ) =>
      findings.push({
        kind: "bad2",
        message,
        reveal,
        ...(createOnly && { createOnly }),
      });
    let duplicate = false;
    if (!name) {
      if (i || requireRootName)
        bad(
          i
            ? "A drafted parent needs a name."
            : "A name is required before this can be created.",
        );
    } else {
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
          !i,
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
        bad(
          `${iri} is already occupied by ${noun || "an existing resource"}.`,
          undefined,
          !i,
        );
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
  if (classes[0].name && !findings.some((f) => f.kind === "bad2")) {
    try {
      store.planClassHierarchy(classes);
    } catch (e) {
      // #203: Apply plans the existing root separately, under its own rules.
      findings.push({
        kind: "bad2",
        message: (e as Error).message,
        createOnly: true,
      });
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
const retarget = (t: Triple, from: string, to: string): Triple => ({
  ...t,
  subject: t.subject === from ? to : t.subject,
  object:
    !t.object.literal && t.object.value === from
      ? { ...t.object, value: to }
      : t.object,
});
const sameStatements = (a: Triple[], b: Triple[]) => {
  const keys = new Set(a.map(statementKey));
  return (
    keys.size === new Set(b.map(statementKey)).size &&
    b.every((t) => keys.has(statementKey(t)))
  );
};
// craigtrim/axiom#203: after Create, the draft edits the entity it created. The
// base is the root plan the form last wrote, so edits made in Details survive.
function planApply(
  store: Store,
  { classes, check }: ReturnType<typeof inspect>,
  { iri, applied }: AddEntityTarget,
  keepName: boolean,
) {
  const findings = check.findings.filter((f) => !f.createOnly);
  const entity = store.entities.get(iri);
  if (!entity)
    findings.push({
      kind: "bad2",
      message: "The entity is no longer available.",
    });
  if (!entity || findings.some((f) => f.kind === "bad2"))
    return { findings, changed: true };
  const current = store.entityStatements(iri);
  // Rename sets the label outright, so its base is the label the entity has
  // now, in each language the last write labelled. An undone Rename is no conflict.
  const languages = new Set(
    (applied?.statements ?? [])
      .filter((t) => t.predicate === LABEL)
      .map((t) => (t.object.language ?? "").toLowerCase()),
  );
  const base = applied?.statements
    .map((t) => retarget(t, applied.iri, iri))
    .filter((t) => keepName || t.predicate !== LABEL)
    .concat(
      keepName
        ? []
        : current.filter(
            (t) =>
              t.predicate === LABEL &&
              languages.has((t.object.language ?? "").toLowerCase()),
          ),
    );
  // A parent the last write created and Undo then removed stays in the plan
  // as written, so the merge keeps the Undo instead of refusing the parent.
  const parentPredicate = classes[0].kind === "individual" ? TYPE : SUBCLASS;
  const undone = (base ?? []).filter(
    (t) =>
      t.predicate === parentPredicate &&
      !t.object.literal &&
      !store.entities.has(t.object.value) &&
      classes[0].parents.some((p) => "iri" in p && p.iri === t.object.value),
  );
  const parents = classes[0].parents.filter(
      (p) => !("iri" in p && undone.some((t) => t.object.value === p.iri)),
    ),
    placeholder = !parents.length && classes[0].kind !== "individual";
  try {
    const { ids, statements } = store.planClassHierarchy(
      // The root keeps its IRI, so plan it under a fresh one and retarget.
      classes.map((c, i) =>
        i
          ? c
          : {
              ...c,
              iri: undefined,
              name: keepName ? displayName(entity) : c.name,
              parents: placeholder ? [{ iri: THING }] : parents,
            },
      ),
    );
    const planned = statements.map((t) => retarget(t, ids.get("0")!, iri));
    const root = [
        ...planned.filter(
          (t) =>
            t.subject === iri &&
            !(
              placeholder &&
              undone.length &&
              t.predicate === SUBCLASS &&
              t.object.value === THING
            ),
        ),
        ...undone,
      ],
      created = planned.filter((t) => t.subject !== iri);
    const merged = mergeEntityStatements(
      base ?? root,
      root,
      current,
      new Set(
        store.tbox
          .filter(
            (t) =>
              t.predicate === TYPE &&
              !t.object.literal &&
              t.object.value === NS.owl + "FunctionalProperty",
          )
          .map((t) => t.subject),
      ),
    );
    // The root keeps its IRI, so check the ancestry the write would leave,
    // through drafted parents and existing descendants alike.
    if (classes[0].kind !== "individual") {
      const up = new Map<string, string[]>();
      for (const t of [...merged, ...created])
        if (t.predicate === SUBCLASS && !t.object.literal)
          up.set(t.subject, [...(up.get(t.subject) ?? []), t.object.value]);
      const parentsOf = (x: string) =>
        up.get(x) ?? store.entities.get(x)?.parents ?? [];
      const seen = new Set<string>(),
        queue = [...parentsOf(iri)];
      while (queue.length) {
        const next = queue.pop()!;
        if (next === iri) throw Error("A class cannot be its own ancestor.");
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(...parentsOf(next));
      }
    }
    return {
      findings,
      changed: !!created.length || !sameStatements(merged, current),
      root,
      merged,
      created,
      ids,
      adopted: applied ? undefined : { iri, statements: root },
    };
  } catch (e) {
    findings.push({ kind: "bad2", message: (e as Error).message });
    return { findings, changed: true };
  }
}
export function checkAddEntity(
  store: Store,
  value: unknown,
  epoch: number,
  target?: unknown,
): AddEntityCheck {
  const inspected = inspect(store, value, epoch, false);
  if (target === undefined) return inspected.check;
  const { changed, findings, adopted } = planApply(
    store,
    inspected,
    readAddEntityTarget(target),
    true,
  );
  return {
    ...inspected.check,
    apply: { changed, findings, ...(adopted && { adopted }) },
  };
}
// The root's parents as written, with each drafted parent's minted IRI.
function rootParents(
  value: unknown,
  ids: Map<string, string>,
  classes: ClassCreation[],
) {
  return readAddEntityInput(value).root.parents.length
    ? classes[0].parents.map((p) => ("iri" in p ? p.iri : ids.get(p.id)!))
    : [];
}
export function createAddEntity(store: Store, value: unknown, epoch: number) {
  const { classes, check } = inspect(store, value, epoch, true);
  const first = check.findings.find((f) => f.kind === "bad2");
  if (first) throw Error(first.message);
  const ids = store.createClassHierarchy(classes);
  const iri = ids.get("0")!;
  return {
    iri,
    created: [...ids.values()],
    parents: rootParents(value, ids, classes),
    applied: { iri, statements: store.entityStatements(iri) },
  };
}
/** Write the draft to the entity it created: Apply, or Rename with any other edits. */
export function applyAddEntity(
  store: Store,
  value: unknown,
  epoch: number,
  targetValue: unknown,
  rename: boolean,
) {
  const target = readAddEntityTarget(targetValue),
    inspected = inspect(store, value, epoch, true);
  const other = planApply(store, inspected, target, true),
    plan = rename ? planApply(store, inspected, target, false) : other;
  const first = plan.findings.find((f) => f.kind === "bad2");
  if (first) throw Error(first.message);
  if (!plan.root || !plan.merged || !plan.created || !plan.ids)
    throw Error("Review the draft before applying it.");
  if (!rename && !plan.changed)
    throw Error("The entity already matches this draft.");
  const edited = !rename || other.changed;
  const iri = !edited
    ? store.rename(target.iri, inspected.classes[0].name)
    : store.updateEntity(
        target.iri,
        plan.merged,
        target.iri,
        undefined,
        plan.created,
      );
  return {
    iri,
    created: [...plan.ids].filter(([id]) => id !== "0").map(([, v]) => v),
    parents: rootParents(value, plan.ids, inspected.classes),
    edited,
    applied: {
      iri,
      statements: plan.root.map((t) => retarget(t, target.iri, iri)),
    },
  };
}
