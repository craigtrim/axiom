// Copy catalogue for the Ontology Quality pane (craigtrim/axiom#44). The pane
// shows no other literal copy except data values and exception reasons.
export const qly = {
  title: "Ontology Quality",
  "idle.headline": "Ready to scan",
  "idle.body":
    "Choose a scope and the checks above, then run the scan. Scanning reads the ontology and changes nothing.",
  "idle.summary": "No scan has been run.",
  run: "Run scan",
  rerun: "Rerun scan",
  "rerun.short": "Rerun",
  change: "Change",
  cancel: "Cancel",
  "running.state": "Scanning",
  "running.progress": "{scanned} of {total} entities",
  "running.body":
    "Results appear when the scan completes. Canceling keeps whatever was found and says so.",
  "canceled.state": "Canceled",
  "canceled.summary": "Stopped after {scanned} of {total} entities.",
  "canceled.body":
    "This report is incomplete and cannot be exported as complete.",
  "failed.state": "Scan failed",
  "failed.headline": "The scan did not finish",
  "failed.fallback": "The scan did not complete.",
  "failed.partial": "Partial results are not shown.",
  "failed.body":
    "No findings are shown, because a partial rule pass cannot be distinguished from a clean one.",
  "clean.headline": "No findings",
  "clean.body":
    "{scanned} entities were scanned and all {checks} enabled checks passed.",
  "clean.body.one":
    "{scanned} entities were scanned and the 1 enabled check passed.",
  "clean.notCanceled": "This is a completed scan, not a canceled one.",
  "nochecks.headline": "No checks are enabled",
  "nochecks.body":
    "Every check group is switched off, so the scan had nothing to test. This is not a clean result. Turn a group back on under Change.",
  "stale.state": "Out of date",
  "stale.store":
    "The ontology changed after this scan. Findings are from revision {ran}; the store is now at {current}.",
  "stale.settings":
    "The scan settings changed. These findings came from {checks} checks over {scope}.",
  "stale.navigate":
    "This report is out of date. Rerun the scan before opening entities in Details.",
  summary:
    "{scope} · {checks} checks · revision {revision} · {scanned} scanned · {time}",
  "scope.label": "Scope",
  "scope.ontology": "Whole ontology",
  "scope.namespace": "Namespace",
  "scope.branch": "Branch",
  "scope.namespaceValue": "Namespace {value}",
  "scope.branchValue": "Branch {value}",
  "scope.root": "Branch root",
  "scope.chooseRoot": "Choose a named class",
  "scope.needsRoot": "Choose a named class as the branch root.",
  "scope.needsNamespace": "Enter a namespace to scan.",
  "kinds.label": "Entity kinds",
  "checks.label": "Checks",
  "checks.hint": "{n} checks.",
  "checks.hint.one": "1 check.",
  "view.findings": "Findings",
  "view.coverage": "Coverage",
  "view.label": "Result view",
  "groupBy.label": "Group findings by",
  "groupBy.rule": "Group by rule",
  "groupBy.entity": "Group by entity",
  "filter.label": "Filter findings",
  "filter.placeholder": "Filter by name or IRI",
  "filter.suppressed": "Suppressed",
  "filter.empty.headline": "No findings match the current filter.",
  "filter.empty.body":
    "The scan itself completed and found {total}. Clear the severity or text filter to see them.",
  "filter.active": "{name}: {value}",
  "filter.remove": "Remove filter {name}: {value}",
  "filter.all": "All",
  "filter.group": "Group",
  "filter.rule": "Rule",
  "filter.kind": "Kind",
  "filter.namespace": "Namespace",
  "page.offpage": "{n} findings, all of them on other pages.",
  "foot.position": "{first} to {last} of {listed} listed",
  "foot.collapsed": "No rule is expanded",
  "foot.totals": "{total} findings · {suppressed} suppressed",
  "foot.page": "Page {page} of {pages}",
  "foot.store":
    "{classes} classes · {individuals} individuals · {triples} triples",
  "foot.first": "First page",
  "foot.previous": "Previous page",
  "foot.next": "Next page",
  "foot.last": "Last page",
  export: "Export",
  "export.label": "Export findings",
  "export.json": "Export JSON",
  "export.csv": "Export CSV",
  "export.note":
    "Export carries all {total} findings plus the scan configuration and revision. Paging does not truncate it.",
  "export.done": "Exported {file}",
  more: "More",
  "more.label": "More finding options",
  "detail.rule": "Rule",
  "detail.basis": "Basis",
  "detail.entity": "Entity",
  "detail.evidence": "Evidence",
  "detail.reading": "Reading",
  "detail.consequence": "Consequence",
  "detail.correction": "Correction",
  "detail.wouldAdd": "Would add",
  "detail.alsoUnder": "Also under",
  "detail.open": "Open {entity} in Details",
  "detail.suppress": "Record exception for {entity}",
  "detail.unsuppress": "Remove exception for {entity}",
  "detail.exception": "Exception",
  "detail.recorded": "Recorded",
  "detail.recordedBody":
    "{date}, keyed to the evidence fingerprint. Changing the entity's statements will return this finding for review.",
  "detail.nothing": "Nothing.",
  "detail.nothingExcluded":
    "Nothing. It does not appear under the exclusion rule.",
  "detail.noEvidence": "No qualifying statement was found.",
  "reading.derived":
    "Axiom displays {name}, derived from the IRI fragment {fragment}. No naming annotation is asserted.",
  "reading.alias":
    "No primary label, but {predicate} carries a supported synonym, so this entity {eligible} for Text Analysis.",
  "reading.eligible": "is still eligible",
  "exception.reason": "Exception reason for {entity}",
  "exception.placeholder": "Reason, required",
  "exception.record": "Record exception",
  "exceptions.title": "Recorded exceptions",
  "exceptions.empty": "No exceptions are recorded for this ontology.",
  "exceptions.close": "Close",
  "coverage.check": "Check",
  "coverage.applicable": "Applicable",
  "coverage.present": "Present",
  "coverage.missing": "Missing",
  "coverage.suppressed": "Suppressed",
  "coverage.na": "not applicable",
  "coverage.note":
    "Every percentage carries its denominator. Not applicable means no entity in scope could be checked, which is a different fact from zero missing. Checks for a vocabulary this ontology does not use are withdrawn from the table entirely, rather than listed as passing.",
  "coverage.exclusions":
    "Entity denominators exclude built in vocabulary, reference only external resources, anonymous expressions and ontology records. Ontology metadata carries its own denominator of {n}.",
  "coverage.disabled": "{n} checks are switched off and are not counted here.",
  "coverage.disabled.one": "1 check is switched off and is not counted here.",
  "coverage.imports": "Declared imports, not loaded by this scan: {list}.",
  "vocab.label": "Vocabulary",
  "vocab.absent": "Not used here: {list}. {n} checks are withdrawn.",
  "vocab.absent.one": "Not used here: {list}. 1 check is withdrawn.",
  "vocab.absent.none": "Not used here: {list}. No checks are withdrawn.",
  "vocab.allPresent": "Every vocabulary the catalog knows about is in use.",
  "severity.note":
    "A Violation breaks a rule configured for this project. It is not automatically an RDF or OWL standards violation.",
  limits:
    "This scan checks what is asserted. It does not run OWL reasoning, judge whether a definition is correct, follow remote links, or load unresolved imports. Checks for a vocabulary the ontology does not use are withdrawn, never reported as passing.",
  "rules.open": "Rules",
  "rules.done": "Done",
  "rules.default": "Default {severity}",
  "rules.off": "Off",
  "rules.severity": "Severity for {rule}",
  "rules.languages": "Preferred languages",
  "rules.languagesHint": "en, es",
  "rules.labelPredicates": "Primary label predicates",
  "rules.descriptionPredicates": "Description predicates",
  "rules.definitionPredicates": "Definition predicates",
  "rules.replacementPredicates": "Replacement predicates",
  "rules.predicatesHint": "One absolute predicate IRI per line.",
  "labels.review": "Review missing labels",
  "labels.reviewSummary":
    "{n} candidates · revision {revision} · identifier derived",
  "labels.selected": "{selected} of {total} selected",
  "labels.selectAll": "Select all",
  "labels.clear": "Clear selection",
  "labels.include": "Include {entity}",
  "labels.ineligible": "{entity} is not eligible",
  "labels.label": "Label for {entity}",
  "labels.predicate": "Predicate for {entity}",
  "labels.language": "Language for {entity}",
  "labels.noLanguage": "none",
  "labels.preview": "Preview selected additions",
  "labels.previewTitle": "Preview",
  "labels.previewSummary": "{n} additions · one undoable edit",
  "labels.apply": "Add {n} labels",
  "labels.apply.one": "Add 1 label",
  "labels.graph": "Graph",
  "labels.graph.single.one":
    "The entity is described in a single source graph and receives its label in that graph.",
  "labels.graph.single.two":
    "Both entities are described in a single source graph and receive their label in that graph.",
  "labels.graph.single":
    "All {n} entities are described in a single source graph and receive their label in that graph.",
  "labels.graph.multiple":
    "{n} entities are described across several graphs and receive their label in the default graph: {list}.",
  "labels.guard": "Guard",
  "labels.guardValue":
    "dataset {dataset} · revision {revision} · preview token {token}",
  "labels.retained": "Retained",
  "labels.retainedValue":
    "Existing annotations are kept. Established and placeholder identifiers are preserved, and this path does not run the normal placeholder renaming behaviour.",
  "labels.applied": "Added {n} labels. Edit > Undo reverses this batch.",
  "labels.notApplied": "Not applied",
  "labels.nothingWritten": "No statements were written.",
  "labels.reject.edits": "Intervening edits.",
  "labels.reject.edits.body":
    "The ontology changed since this preview was built. Build it again.",
  "labels.reject.replaced": "Replaced previews.",
  "labels.reject.replaced.body": "A newer preview replaced this one.",
  "labels.reject.invalid": "Invalid batches.",
  "labels.reject.invalid.body":
    "This batch does not validate against the current store.",
  "labels.reject.duplicate": "Duplicate selections.",
  "labels.reject.duplicate.body":
    "{entity} appears more than once in this batch.",
  "labels.reject.repeated": "Repeated application.",
  "labels.reject.repeated.body": "These additions were already applied.",
  "labels.conflicting": "Conflicting existing label.",
  "labels.blank": "Blank existing label.",
  "labels.details": "Edit this label in Details instead.",
  "labels.unavailable":
    "Review missing labels needs a completed scan that is still current.",
  "recovery.name": "Quality",
  "recovery.widen": "Widen the pane to work with it.",
  "recovery.maximize": "Maximize pane",
  "announce.complete": "Scan complete. {total} findings from {checks} checks.",
  "announce.canceled": "Scan canceled.",
  "announce.failed": "Scan failed.",
  "announce.stale": "Report out of date.",
} as const;
export type QlyKey = keyof typeof qly;
const value = (v: string | number) =>
  typeof v === "number" ? v.toLocaleString("en-US") : v;
/** Fills `{name}` placeholders; numbers use grouped digits as the reference does. */
export function t(
  key: QlyKey,
  values: Record<string, string | number> = {},
): string {
  return qly[key].replace(/\{(\w+)\}/g, (_, k: string) =>
    k in values ? value(values[k]) : "",
  );
}
/** Picks the `.one` variant when the catalogue has one and n is 1. */
export const tn = (
  key: QlyKey,
  n: number,
  values: Record<string, string | number> = {},
) => {
  const one = (key + ".one") as QlyKey;
  return n === 1 && one in qly ? t(one, values) : t(key, { n, ...values });
};
/** Per-rule copy: the coverage check name, the consequence, and what coverage tests. */
export const ruleCopy: Record<
  string,
  { check: string; why: string; tests?: string }
> = {
  "label.missing": {
    check: "Explicit label",
    why: "Axiom derives a display name from the IRI, so the gap is invisible in ordinary browsing.",
  },
  "label.empty": {
    check: "Nonempty label",
    why: "An empty label displays as nothing and matches nothing in Text Analysis.",
    tests: "Text in each primary label",
  },
  "label.whitespace": {
    check: "Trimmed label",
    why: "Surrounding spaces make equal names compare as different.",
    tests: "Leading and trailing spaces in primary labels",
  },
  "label.placeholder": {
    check: "Meaningful name",
    why: "A creation placeholder such as NewClass tells a reader nothing about the entity.",
    tests: "Identifiers and labels that resemble creation placeholders",
  },
  "label.duplicate": {
    check: "Distinct label",
    why: "Two entities with one name are hard to tell apart in search and in Text Analysis.",
    tests: "Normalized primary labels shared with other entities, per language",
  },
  "label.multiple": {
    check: "Single label per language",
    why: "Several labels in one language leave the preferred name unclear.",
    tests: "rdfs:label values per language",
  },
  "label.language": {
    check: "Configured languages",
    why: "Readers working in a configured language see no name in it.",
    tests: "Primary labels in each preferred language",
  },
  "label.style": {
    check: "Consistent naming style",
    why: "Mixed separators make names harder to scan and to match.",
    tests: "Word separation across primary labels",
  },
  "skos.multiple": {
    check: "Single preferred label",
    why: "SKOS allows one skos:prefLabel per language, and consumers rely on it.",
    tests: "skos:prefLabel values per language",
  },
  "skos.disjoint": {
    check: "Disjoint SKOS label roles",
    why: "SKOS forbids one literal in two label roles, so consumers cannot tell which role it plays.",
    tests:
      "Literals shared by skos:prefLabel, skos:altLabel and skos:hiddenLabel",
  },
  "skos.literal": {
    check: "Text SKOS labels",
    why: "A SKOS label that is not text cannot be displayed or matched as a name.",
    tests: "Datatypes of SKOS label values",
  },
  "description.missing": {
    check: "Description",
    why: "Without a description a reader has only the name to go on.",
  },
  "definition.missing": {
    check: "Dedicated definition",
    why: "A general comment does not say precisely what the entity means.",
  },
  "description.repeated": {
    check: "Description adds meaning",
    why: "A description that repeats the name explains nothing.",
    tests: "Descriptions compared with the entity's names",
  },
  "definition.duplicate": {
    check: "Distinct definition",
    why: "Entities that share a definition cannot be told apart by it.",
    tests: "Normalized definitions shared with other entities",
  },
  "documentation.missing": {
    check: "Supporting notes",
    why: "Examples and scope notes help readers apply the entity correctly.",
    tests: "SKOS example, scope, editorial, history and change notes",
  },
  "alias.missing": {
    check: "Alternative names",
    why: "Without synonyms, Text Analysis finds the entity only by its primary name.",
    tests:
      "skos:altLabel, skos:hiddenLabel, rdfs:seeAlso text and inflection values",
  },
  "alias.empty": {
    check: "Nonempty alternative names",
    why: "A blank alias adds nothing and can confuse editors.",
    tests: "Text in each alternative name",
  },
  "alias.primary": {
    check: "Alias differs from name",
    why: "An alias that repeats the primary name adds nothing.",
    tests: "Alternative names compared with primary names",
  },
  "alias.shared": {
    check: "Unambiguous alternative names",
    why: "A name shared with another entity makes matches ambiguous.",
    tests: "Alternative names shared with other entities",
  },
  "alias.legacy": {
    check: "Standard synonym predicate",
    why: "rdfs:seeAlso points to further information, so tools other than Axiom will not read it as a synonym.",
    tests: "Literal rdfs:seeAlso values",
  },
  "structure.isolated": {
    check: "Connected entity",
    why: "An entity with no relationships is easy to lose and may be unfinished.",
    tests: "Non-built-in relationships in either direction",
  },
  "structure.component": {
    check: "Connected taxonomy",
    why: "A separate component may be a forgotten branch rather than an intended root.",
    tests: "Named-class components in the scanned scope",
  },
  "structure.parent": {
    check: "Explicit parent",
    why: "Without a superclass the class sits at the top level, which may not be intended.",
    tests: "rdfs:subClassOf asserted locally",
  },
  "structure.cycle": {
    check: "Acyclic hierarchy",
    why: "A subclass cycle makes its members equivalent, which is rarely intended.",
    tests: "rdfs:subClassOf and owl:equivalentClass paths",
  },
  "structure.declaration": {
    check: "Explicit declaration",
    why: "An undeclared entity's role is only inferred from use, and other tools may read it differently.",
    tests: "rdf:type declarations matching the entity's role",
  },
  "structure.type": {
    check: "Individual type assertion",
    why: "An untyped individual belongs to no class, so class-based views omit it.",
    tests: "rdf:type on a named individual",
  },
  "structure.unresolved": {
    check: "Resolved references",
    why: "A reference to an undefined resource may be a typo or a missing import.",
    tests: "Referenced resources defined in the loaded data",
  },
  "property.domain": {
    check: "Property domain",
    why: "Without a domain, readers cannot tell which entities the property describes.",
    tests: "Object and data properties only; annotation properties are exempt",
  },
  "property.range": {
    check: "Property range",
    why: "Without a range, readers cannot tell which values the property expects.",
    tests:
      "rdfs:range on object and data properties; annotation properties are exempt",
  },
  "property.multiple": {
    check: "Single domain and range",
    why: "Several domains or ranges apply together, which narrows the property more than expected.",
    tests: "rdfs:domain and rdfs:range values per property",
  },
  "deprecated.boolean": {
    check: "Valid deprecation value",
    why: "A deprecation value that is not an xsd:boolean may be ignored by other tools.",
    tests: "owl:deprecated values",
  },
  "deprecated.reference": {
    check: "No retired references",
    why: "References to retired entities keep outdated terms in use.",
    tests: "References to entities marked owl:deprecated",
  },
  "deprecated.guidance": {
    check: "Retirement guidance",
    why: "Without replacement guidance, users of a retired entity do not know what to use instead.",
  },
  "metadata.missing": {
    check: "Ontology metadata",
    why: "Publishers and reusers rely on a title, license and version to cite and trust the ontology.",
    tests:
      "License, version and the rest of the publication checklist, counted per ontology",
  },
  "analysis.excluded": {
    check: "Text Analysis eligibility",
    why: "Text Analysis cannot highlight an entity that has no supported naming annotation.",
    tests: "Any naming annotation the current matcher consumes",
  },
};
