import { createHash } from "node:crypto";
import { NS, TYPE, SUBCLASS, THING, type Entity, type Triple } from "./model";
import type { Store } from "./store";
import { taxonomyParents } from "./class-expressions";
import { isDefaultIdentifier, statementKey, validResource } from "./rdf-model";
import { textAnalysisConcepts } from "./text-analysis-concepts";
import { cyclicNodes } from "./sparsity";
import {
  qualityNamespace,
  qualityRules,
  readQualityOptions,
  type QualityReport,
  type QualityFinding,
  type QualityOptions,
} from "../shared/ontology-quality";

const primary = NS.rdfs + "label",
  pref = NS.skos + "prefLabel";
const skosLabels = [pref, NS.skos + "altLabel", NS.skos + "hiddenLabel"];
const builtIn = (iri: string) =>
  [NS.rdf, NS.rdfs, NS.owl, NS.xsd, NS.skos, NS.dc, NS.dcterms].some((n) =>
    iri.startsWith(n),
  );
const named = (iri: string) => !iri.startsWith("_:");
const text = (t: Triple) => t.object.literal && !!t.object.value.trim();
const inflection = (p: string) =>
  p.slice(p.lastIndexOf("#") + 1) === "inflection";
const alias = (t: Triple) =>
  [NS.skos + "altLabel", NS.skos + "hiddenLabel", NS.rdfs + "seeAlso"].includes(
    t.predicate,
  ) || inflection(t.predicate);
const lang = (t: Triple) => (t.object.language ?? "").toLowerCase();
const lexical = (t: Triple) =>
  JSON.stringify([
    t.object.value,
    lang(t),
    t.object.datatype ??
      (t.object.language ? NS.rdf + "langString" : NS.xsd + "string"),
    t.object.literal,
  ]);
const normalized = (t: Triple) =>
  JSON.stringify([t.object.value.trim().toLowerCase(), lang(t)]);
const distinct = (ts: Triple[]) => [
  ...new Map(ts.map((t) => [lexical(t), t])).values(),
];
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface QualityInput {
  triples: Triple[];
  entities: (Pick<Entity, "iri" | "kind"> & {
    label: string;
    parents: string[];
  })[];
  analysis: Set<string>;
  datasetEpoch: number;
  version: number;
  ontology: string;
  name: string;
}
export function qualityInput(store: Store, datasetEpoch: number): QualityInput {
  const triples = structuredClone([...store.scan()]);
  const entities = [...store.entities.values()].map((e) => ({
    iri: e.iri,
    kind: e.kind,
    label: store.label(e.iri),
    parents: [...taxonomyParents(e)],
  }));
  for (const e of [...store.individuals, ...store.customers])
    if (!store.entities.has(e.iri))
      entities.push({
        iri: e.iri,
        kind: "Individual",
        label: store.label(e.iri),
        parents: [],
      });
  const analysisTriples = store.ontology.assertedOnly
    ? triples
    : [
        ...triples,
        ...[...store.entities.keys()].flatMap((iri) =>
          store.entityStatements(iri),
        ),
      ];
  return {
    triples,
    entities,
    analysis: new Set(
      Object.values(textAnalysisConcepts(store, analysisTriples))
        .flat()
        .map((c) => c.iri),
    ),
    datasetEpoch,
    version: store.version,
    ontology: JSON.stringify([
      store.ontology.iri ?? "",
      store.ontology.source?.baseIRI ?? "",
      store.ontology.namespace,
      store.ontology.name,
    ]),
    name: store.ontology.name,
  };
}

/** Yields between bounded batches so worker requests, including cancellation, can run. */
export function* scanQuality(
  input: QualityInput,
  supplied: unknown,
): Generator<{ scanned: number; total: number; phase: string }, QualityReport> {
  const options = readQualityOptions(supplied);
  if (
    !options.labelPredicates.length ||
    [
      ...options.labelPredicates,
      ...options.descriptionPredicates,
      ...options.definitionPredicates,
      ...options.replacementPredicates,
    ].some((p) => !validResource(p, false))
  )
    throw Error(
      "Configure absolute predicate IRIs and at least one primary-label predicate.",
    );
  if (options.languages.some((l) => !/^[a-z]+(?:-[a-z0-9]+)*$/i.test(l)))
    throw Error("Use language tags such as en or en-US.");
  if (options.scope === "namespace" && !options.namespace)
    throw Error("Enter a namespace to scan.");
  if (!options.kinds.length || !options.groups.length)
    throw Error("Select at least one entity kind and check group.");
  const bySubject = new Map<string, Triple[]>(),
    definitions = new Set<string>(),
    incoming = new Set<string>();
  const references = new Map<string, Triple[]>(),
    parents = new Map<string, string[]>(),
    children = new Map<string, string[]>();
  const all = new Map(input.entities.map((e) => [e.iri, e]));
  const append = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
  };
  let index = 0;
  for (const t of input.triples) {
    append(bySubject, t.subject, t);
    definitions.add(t.subject);
    if (!t.object.literal) {
      append(references, t.object.value, t);
      if (t.predicate !== TYPE && !builtIn(t.object.value))
        incoming.add(t.object.value);
    }
    append(references, t.predicate, t);
    if (++index % 512 === 0)
      yield {
        scanned: 0,
        total: input.entities.length,
        phase: "Indexing statements",
      };
  }
  for (const e of input.entities) {
    const ps = e.parents.filter((p) => all.has(p));
    parents.set(e.iri, ps);
    children.set(e.iri, []);
  }
  for (const [iri, ps] of parents)
    for (const p of ps) children.get(p)!.push(iri);
  const cyclic = cyclicNodes(children, parents);
  let branch: Set<string> | undefined;
  if (options.scope === "branch") {
    const root = all.get(options.root);
    if (!root || !["Class", "Defined"].includes(root.kind))
      throw Error("Choose a named class as the branch root.");
    branch = new Set([root.iri]);
    const queue = [root.iri];
    if (root.iri === THING)
      for (const e of input.entities)
        if (["Class", "Defined"].includes(e.kind)) {
          branch.add(e.iri);
          queue.push(e.iri);
        }
    for (let i = 0; i < queue.length; i++)
      for (const c of children.get(queue[i]) ?? [])
        if (!branch.has(c)) {
          branch.add(c);
          queue.push(c);
        }
  }
  const ontologySubjects = new Set(
    input.triples
      .filter(
        (t) =>
          t.predicate === TYPE &&
          !t.object.literal &&
          t.object.value === NS.owl + "Ontology",
      )
      .map((t) => t.subject),
  );
  const candidates = input.entities.filter(
    (e) =>
      named(e.iri) &&
      !builtIn(e.iri) &&
      definitions.has(e.iri) &&
      !ontologySubjects.has(e.iri),
  );
  const selected = candidates.filter(
    (e) =>
      options.kinds.includes(e.kind) &&
      (options.scope !== "namespace" ||
        qualityNamespace(e.iri) === options.namespace) &&
      (!branch || branch.has(e.iri)),
  );
  const classIds = new Set(
    selected
      .filter((e) => ["Class", "Defined"].includes(e.kind))
      .map((e) => e.iri),
  );
  const components: string[][] = [],
    visited = new Set<string>();
  for (const iri of [...classIds].sort()) {
    if (visited.has(iri)) continue;
    const component = [iri];
    visited.add(iri);
    for (let i = 0; i < component.length; i++)
      for (const neighbor of [
        ...(parents.get(component[i]) ?? []),
        ...(children.get(component[i]) ?? []),
      ]) {
        if (classIds.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          component.push(neighbor);
        }
      }
    components.push(component.sort());
  }
  components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const disconnected = new Map(components.slice(1).map((c) => [c[0], c]));
  const names = new Map<string, Triple[]>(),
    defs = new Map<string, Triple[]>(),
    aliases = new Map<string, Triple[]>();
  const deprecated = new Set(
    input.triples
      .filter(
        (t) =>
          t.predicate === NS.owl + "deprecated" &&
          t.object.literal &&
          ["true", "1"].includes(t.object.value.trim()) &&
          t.object.datatype === NS.xsd + "boolean",
      )
      .map((t) => t.subject),
  );
  for (const e of selected)
    for (const t of bySubject.get(e.iri) ?? []) {
      if (text(t) && options.labelPredicates.includes(t.predicate))
        append(names, normalized(t), t);
      if (text(t) && options.definitionPredicates.includes(t.predicate))
        append(defs, normalized(t), t);
      if (text(t) && alias(t)) append(aliases, normalized(t), t);
    }
  const styles = new Set(
    [...names.values()]
      .flat()
      .map((t) =>
        t.object.value.includes("_")
          ? "underscore"
          : /[a-z][A-Z]/.test(t.object.value)
            ? "camel"
            : "words",
      ),
  );
  const findings: QualityFinding[] = [];
  const applicability = new Map<string, Set<string>>(),
    affected = new Map<string, Set<string>>();
  const active = (id: string) => {
    const r = qualityRules.find((r) => r.id === id)!;
    return options.rules[id] !== "Off" && options.groups.includes(r.group);
  };
  const check = (
    e: { iri: string; label: string; kind: string },
    id: string,
    applies: boolean,
    fails: boolean,
    message: string,
    suggestion: string,
    evidence: Triple[] = [],
    related: string[] = [],
  ) => {
    if (applies) {
      const set = applicability.get(id) ?? new Set();
      set.add(e.iri);
      applicability.set(id, set);
    }
    if (!applies || !fails || !active(id)) return;
    const r = qualityRules.find((r) => r.id === id)!;
    const ts = [
      ...new Map(evidence.map((t) => [statementKey(t), t])).values(),
    ].sort((a, b) => statementKey(a).localeCompare(statementKey(b)));
    const ids = [...new Set(related)].sort();
    const signature = digest([
      id,
      e.iri,
      message,
      ts,
      ids,
      options.profile,
      options.rules[id],
    ]);
    findings.push({
      id: signature,
      signature,
      rule: id,
      severity: options.rules[id] as QualityFinding["severity"],
      group: r.group,
      basis:
        options.rules[id] === "Violation" && r.severity !== "Violation"
          ? options.profile + " selected project constraint"
          : r.basis,
      iri: e.iri,
      label: e.label,
      kind: e.kind,
      namespace: qualityNamespace(e.iri),
      message,
      suggestion,
      evidence: ts,
      related: ids,
    });
    const set = affected.get(id) ?? new Set();
    set.add(e.iri);
    affected.set(id, set);
  };
  let scanned = 0;
  for (const e of selected) {
    const ts = bySubject.get(e.iri) ?? [],
      labels = ts.filter((t) => options.labelPredicates.includes(t.predicate)),
      validLabels = labels.filter(text);
    const descriptions = ts.filter(
      (t) =>
        options.descriptionPredicates.includes(t.predicate) &&
        (text(t) || !t.object.literal),
    );
    const definition = ts.filter(
      (t) =>
        options.definitionPredicates.includes(t.predicate) &&
        (text(t) || !t.object.literal),
    );
    const alts = ts.filter((t) => alias(t) && t.object.literal),
      nonemptyAlts = alts.filter(text);
    const c = (
      id: string,
      applies: boolean,
      fails: boolean,
      message: string,
      suggestion: string,
      evidence: Triple[] = [],
      related: string[] = [],
    ) => check(e, id, applies, fails, message, suggestion, evidence, related);
    c(
      "label.missing",
      true,
      labels.length === 0,
      "No explicit primary label under the selected policy. Axiom may display a name derived from the identifier.",
      "Review a proposed label or add the appropriate primary-label statement.",
      ts,
    );
    c(
      "label.empty",
      !!labels.length,
      labels.some((t) => !text(t)),
      "A primary label is empty or is not a text literal.",
      "Enter a nonempty text label.",
      labels.filter((t) => !text(t)),
    );
    c(
      "label.whitespace",
      !!validLabels.length,
      validLabels.some((t) => t.object.value !== t.object.value.trim()),
      "A primary label has surrounding whitespace.",
      "Review and trim the label.",
      validLabels.filter((t) => t.object.value !== t.object.value.trim()),
    );
    c(
      "label.placeholder",
      true,
      isDefaultIdentifier(e.iri) ||
        validLabels.some((t) =>
          isDefaultIdentifier("urn:" + t.object.value.replace(/\s+/g, "")),
        ),
      "The identifier or label resembles a creation placeholder.",
      "Choose a meaningful label; keep established identifiers stable.",
      labels,
    );
    const duplicated = validLabels
      .flatMap((t) => names.get(normalized(t)) ?? [])
      .filter((t) => t.subject !== e.iri);
    c(
      "label.duplicate",
      !!validLabels.length,
      !!duplicated.length,
      "Other entities in this scan use the same normalized primary label and language.",
      "Review ambiguity; shared labels do not establish identity.",
      [...validLabels, ...duplicated],
      duplicated.map((t) => t.subject),
    );
    const raw = ts.filter((t) => t.predicate === primary && text(t));
    const multilang = (values: Triple[]) =>
      [...new Set(values.map(lang))].some(
        (l) => distinct(values.filter((t) => lang(t) === l)).length > 1,
      );
    c(
      "label.multiple",
      !!raw.length,
      multilang(raw),
      "Multiple rdfs:label values occur in one language. RDFS permits this; review the project convention.",
      "Retain intentional alternatives or clarify the preferred name.",
      raw,
    );
    const missingLanguages = options.languages.filter(
      (l) => !validLabels.some((t) => lang(t) === l),
    );
    c(
      "label.language",
      !!options.languages.length,
      !!missingLanguages.length,
      "Missing primary labels for configured languages: " +
        missingLanguages.join(", "),
      "Add reviewed translations in the configured languages.",
      labels,
    );
    c(
      "label.style",
      !!validLabels.length,
      styles.size > 1 &&
        validLabels.some((t) => /_|[a-z][A-Z]/.test(t.object.value)),
      "Primary labels use mixed word-separation conventions in this scope.",
      "Review the project's naming style; no English-only convention is imposed.",
      validLabels,
    );
    const skos = ts.filter((t) => skosLabels.includes(t.predicate));
    const preferred = skos.filter((t) => t.predicate === pref && text(t));
    c(
      "skos.multiple",
      !!preferred.length,
      multilang(preferred),
      "More than one distinct skos:prefLabel occurs in a language (SKOS S14).",
      "Retain one preferred label per language; use alternative labels for alternatives.",
      preferred,
    );
    const conflicting = skos.filter(
      (t) =>
        t.object.literal &&
        skos.some(
          (o) => o.predicate !== t.predicate && lexical(o) === lexical(t),
        ),
    );
    c(
      "skos.disjoint",
      !!skos.length,
      !!conflicting.length,
      "An identical RDF literal occupies conflicting SKOS label roles (SKOS S13).",
      "Assign each literal a single label role for this entity.",
      conflicting,
    );
    c(
      "skos.literal",
      !!skos.length,
      skos.some(
        (t) =>
          !t.object.literal ||
          (!!t.object.datatype &&
            ![NS.xsd + "string", NS.rdf + "langString"].includes(
              t.object.datatype,
            )),
      ),
      "A SKOS label is not a plain or language-tagged string.",
      "Use a text literal for SKOS labels.",
      skos,
    );
    c(
      "description.missing",
      true,
      !descriptions.length,
      "No nonempty description under the selected predicates.",
      "Describe what the entity means.",
    );
    c(
      "definition.missing",
      [
        "Class",
        "Defined",
        "ObjectProperty",
        "DataProperty",
        "AnnotationProperty",
        "Resource",
      ].includes(e.kind),
      !definition.length,
      "No dedicated definition under the selected predicates.",
      "Add a definition separately from general commentary.",
    );
    const repeated = descriptions.filter(
      (d) =>
        validLabels.some((l) => normalized(d) === normalized(l)) ||
        d.object.value.trim().toLowerCase() === e.label.trim().toLowerCase(),
    );
    c(
      "description.repeated",
      !!descriptions.length,
      !!repeated.length,
      "A description repeats the name without additional explanation.",
      "Explain the meaning or scope of the entity.",
      repeated,
    );
    const sharedDefs = definition
      .flatMap((t) => defs.get(normalized(t)) ?? [])
      .filter((t) => t.subject !== e.iri);
    c(
      "definition.duplicate",
      !!definition.length,
      !!sharedDefs.length,
      "Other entities share an identical normalized definition and language.",
      "Review whether each definition distinguishes its entity.",
      [...definition, ...sharedDefs],
      sharedDefs.map((t) => t.subject),
    );
    const notes = ts.filter(
      (t) =>
        [
          "example",
          "scopeNote",
          "editorialNote",
          "historyNote",
          "changeNote",
        ].some((p) => t.predicate === NS.skos + p) &&
        (text(t) || !t.object.literal),
    );
    c(
      "documentation.missing",
      true,
      !notes.length,
      "No examples, scope, editorial, or history notes were found.",
      "Add supporting documentation where useful; this is optional enrichment.",
    );
    c(
      "alias.missing",
      true,
      !nonemptyAlts.length,
      "No nonempty alternative names were found.",
      "Add genuine synonyms or abbreviations if applicable.",
    );
    c(
      "alias.empty",
      !!alts.length,
      alts.some((t) => !text(t)),
      "An alternative name is blank.",
      "Remove the empty annotation or enter the intended name.",
      alts.filter((t) => !text(t)),
    );
    const repeats = nonemptyAlts.filter((t) =>
      validLabels.some((l) => normalized(t) === normalized(l)),
    );
    c(
      "alias.primary",
      !!alts.length,
      !!repeats.length,
      "An alternative name repeats a normalized primary name in the same language.",
      "Review the redundant alias; SKOS exact conflicts are reported separately.",
      repeats,
    );
    const sharedAlts = nonemptyAlts
      .flatMap((t) => [
        ...(aliases.get(normalized(t)) ?? []),
        ...(names.get(normalized(t)) ?? []),
      ])
      .filter((t) => t.subject !== e.iri);
    c(
      "alias.shared",
      !!nonemptyAlts.length,
      !!sharedAlts.length,
      "An alternative name is also a name of another entity in this scan.",
      "Review ambiguity without automatically merging entities.",
      [...nonemptyAlts, ...sharedAlts],
      sharedAlts.map((t) => t.subject),
    );
    const legacy = alts.filter((t) => t.predicate === NS.rdfs + "seeAlso");
    c(
      "alias.legacy",
      !!legacy.length,
      !!legacy.length,
      "Literal seeAlso values are a legacy Axiom synonym convention; RDFS uses seeAlso for additional information.",
      "Consider skos:altLabel in a separately reviewed migration. Existing behavior is preserved.",
      legacy,
    );
    const classEntity = ["Class", "Defined"].includes(e.kind),
      propertyEntity = [
        "ObjectProperty",
        "DataProperty",
        "AnnotationProperty",
      ].includes(e.kind);
    c(
      "structure.component",
      classEntity,
      disconnected.has(e.iri),
      "This taxonomy component is disconnected from the largest named-class component in the selected scope. Multiple roots may be intentional.",
      "Review the component's placement; this does not establish missing concepts.",
      ts.filter((t) =>
        [SUBCLASS, NS.owl + "equivalentClass"].includes(t.predicate),
      ),
      disconnected.get(e.iri),
    );
    const links = ts.filter(
      (t) =>
        !t.object.literal && t.predicate !== TYPE && !builtIn(t.object.value),
    );
    c(
      "structure.isolated",
      classEntity || propertyEntity,
      !links.length &&
        !incoming.has(e.iri) &&
        !(references.get(e.iri) ?? []).some((t) => t.predicate === e.iri),
      "No non-built-in resource relationships connect this entity to others in the loaded data.",
      "Review whether the entity is an intentional root or needs relationships.",
      ts,
    );
    c(
      "structure.parent",
      classEntity,
      !ts.some((t) => t.predicate === SUBCLASS && !t.object.literal),
      "No explicit superclass statement. Root classes may be intentional.",
      "Review placement or record an intentional root exception.",
      ts.filter((t) => t.predicate === TYPE),
    );
    c(
      "structure.cycle",
      classEntity,
      cyclic.has(e.iri),
      "This entity participates in a hierarchy cycle or self-link; subclass cycles can imply equivalence.",
      "Inspect the participating hierarchy relationships.",
      ts.filter((t) =>
        [SUBCLASS, NS.owl + "equivalentClass"].includes(t.predicate),
      ),
      parents.get(e.iri),
    );
    const declarations = classEntity
      ? [NS.owl + "Class", NS.rdfs + "Class"]
      : propertyEntity
        ? [
            NS.owl + "ObjectProperty",
            NS.owl + "DatatypeProperty",
            NS.owl + "AnnotationProperty",
            NS.rdf + "Property",
          ]
        : e.kind === "Datatype"
          ? [NS.rdfs + "Datatype"]
          : [];
    c(
      "structure.declaration",
      !!declarations.length,
      !ts.some(
        (t) =>
          t.predicate === TYPE &&
          !t.object.literal &&
          declarations.includes(t.object.value),
      ),
      "This entity's role is projected from usage without a matching explicit declaration.",
      "Review inferred usage and imported definitions before adding a declaration.",
      ts,
    );
    c(
      "structure.type",
      e.kind === "Individual",
      !ts.some(
        (t) =>
          t.predicate === TYPE && !t.object.literal && !builtIn(t.object.value),
      ),
      "No explicit domain class assignment is present in the loaded data.",
      "Review the individual's class assignment; multiple types are allowed.",
      ts.filter((t) => t.predicate === TYPE),
    );
    const unresolved = ts.filter((t) =>
      [t.predicate, ...(!t.object.literal ? [t.object.value] : [])].some(
        (i) => named(i) && !builtIn(i) && !definitions.has(i),
      ),
    );
    c(
      "structure.unresolved",
      true,
      !!unresolved.length,
      "Some referenced resources are undefined in the loaded data. External links and unloaded imports may be intentional.",
      "Inspect the references and available imports; absence here does not establish nonexistence.",
      unresolved,
      unresolved
        .flatMap((t) => [
          t.predicate,
          ...(!t.object.literal ? [t.object.value] : []),
        ])
        .filter((i) => named(i) && !builtIn(i) && !definitions.has(i)),
    );
    const constrainedProperty = ["ObjectProperty", "DataProperty"].includes(
      e.kind,
    );
    for (const p of ["domain", "range"]) {
      const values = ts.filter((t) => t.predicate === NS.rdfs + p);
      c(
        "property." + p,
        constrainedProperty,
        !values.length,
        "No explicit property " + p + " is present.",
        "Review whether a constraint is intended; adding one changes inferred types.",
      );
    }
    const domains = ts.filter((t) => t.predicate === NS.rdfs + "domain"),
      ranges = ts.filter((t) => t.predicate === NS.rdfs + "range");
    c(
      "property.multiple",
      constrainedProperty,
      distinct(domains).length > 1 || distinct(ranges).length > 1,
      "Multiple domain/range values apply together, rather than specifying alternatives.",
      "Review whether conjunction was intended.",
      [...domains, ...ranges],
    );
    const retired = ts.filter((t) => t.predicate === NS.owl + "deprecated");
    c(
      "deprecated.boolean",
      !!retired.length,
      retired.some(
        (t) =>
          !t.object.literal ||
          t.object.datatype !== NS.xsd + "boolean" ||
          !["true", "false", "1", "0"].includes(t.object.value.trim()),
      ),
      "A deprecation annotation is not an xsd:boolean lexical value.",
      "Review the intended boolean deprecation status.",
      retired,
    );
    const retiredRefs = ts.filter(
      (t) =>
        deprecated.has(t.predicate) ||
        (!t.object.literal && deprecated.has(t.object.value)),
    );
    c(
      "deprecated.reference",
      true,
      !!retiredRefs.length,
      "This entity references a deprecated entity.",
      "Review replacement guidance before changing references.",
      retiredRefs,
    );
    c(
      "deprecated.guidance",
      deprecated.has(e.iri),
      !ts.some(
        (t) =>
          (options.replacementPredicates.includes(t.predicate) ||
            t.predicate === NS.rdfs + "comment") &&
          (text(t) || !t.object.literal),
      ),
      "The deprecated entity has no replacement or retirement guidance under this policy.",
      "Document retirement, an exact replacement, or alternatives as appropriate.",
      retired,
    );
    c(
      "analysis.excluded",
      true,
      !input.analysis.has(e.iri),
      "This entity is excluded from the current Text Analysis concept map because it has no supported naming annotations.",
      "Review an explicit label or supported alias; display-name fallback alone does not establish eligibility.",
      ts,
    );
    scanned++;
    if (scanned % 64 === 0)
      yield { scanned, total: selected.length, phase: "Checking entities" };
  }
  if (!ontologySubjects.size) ontologySubjects.add(input.ontology);
  for (const iri of ontologySubjects) {
    const ts = bySubject.get(iri) ?? [];
    const fields: [string, string[]][] = [
      ["title", [primary, NS.dc + "title", NS.dcterms + "title"]],
      ["description", options.descriptionPredicates],
      ["version", [NS.owl + "versionIRI", NS.owl + "versionInfo"]],
      [
        "creator or maintainer",
        [
          NS.dc + "creator",
          NS.dcterms + "creator",
          NS.dc + "publisher",
          NS.dcterms + "publisher",
        ],
      ],
      ["license", [NS.dcterms + "license", NS.dc + "rights"]],
      [
        "provenance or source",
        [
          NS.dcterms + "source",
          NS.dc + "source",
          NS.dcterms + "provenance",
          "http://www.w3.org/ns/prov#wasDerivedFrom",
        ],
      ],
    ];
    const missing = fields
      .filter(
        ([, predicates]) =>
          !ts.some(
            (t) =>
              predicates.includes(t.predicate) &&
              (text(t) || !t.object.literal),
          ),
      )
      .map(([field]) => field);
    if (!bySubject.has(iri)) missing.unshift("ontology declaration/identifier");
    check(
      { iri, label: input.name, kind: "Ontology" },
      "metadata.missing",
      true,
      !!missing.length,
      "Missing ontology metadata: " + missing.join(", "),
      "Review the publication checklist for the ontology as a whole.",
      ts,
    );
  }
  const imports = [
    ...new Set(
      input.triples
        .filter((t) => t.predicate === NS.owl + "imports" && !t.object.literal)
        .map((t) => t.object.value),
    ),
  ];
  return {
    ontology: input.ontology,
    name: input.name,
    datasetEpoch: input.datasetEpoch,
    version: input.version,
    createdAt: new Date().toISOString(),
    options,
    scanned,
    candidates: candidates.length,
    findings,
    coverage: qualityRules.map((r) => ({
      rule: r.id,
      applicable: applicability.get(r.id)?.size ?? 0,
      affected: affected.get(r.id)?.size ?? 0,
      notApplicable:
        (r.id === "metadata.missing" ? ontologySubjects.size : scanned) -
        (applicability.get(r.id)?.size ?? 0),
      checked: active(r.id),
    })),
    imports,
    notes: [
      "Checks use loaded statements; no remote imports are fetched and a complete import closure is not assumed.",
      "Named subjects only; built-in vocabulary, anonymous expressions, and reference-only resources are excluded from completeness denominators.",
      "Branch scope includes the root and named taxonomy descendants. Namespace scope uses the exact identifier namespace.",
      "This is a deterministic quality review, not proof of logical consistency or domain completeness.",
      ...(imports.length
        ? [
            "Declared imports: " +
              imports.length +
              ". References may depend on definitions outside the loaded data.",
          ]
        : []),
    ],
  };
}
