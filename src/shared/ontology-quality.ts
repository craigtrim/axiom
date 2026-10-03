import { NS, type Kind, type Triple } from "../domain/model";

// Group names, the vocabulary census and profile removal: craigtrim/axiom#44.
export const qualityGroups = [
  "Completeness",
  "Naming",
  "Structure",
  "Retired entities",
  "Publication metadata",
  "Text Analysis compatibility",
] as const;
export type QualitySeverity = "Violation" | "Warning" | "Information";
export type QualityGroup = (typeof qualityGroups)[number];
/** Saved workspace settings from before the rename keep their selections. */
const legacyGroups: Record<string, QualityGroup> = {
  "Deprecated entities": "Retired entities",
  "Ontology metadata": "Publication metadata",
  "Axiom compatibility": "Text Analysis compatibility",
};
export const qualityGroupLabel = (g: QualityGroup) =>
  g === "Text Analysis compatibility" ? "Text Analysis" : g;
export const qualityVocabularies = [
  "RDFS",
  "OWL",
  "SKOS",
  "owl:deprecated",
  "Dublin Core",
  "IAO",
] as const;
export type QualityVocabulary = (typeof qualityVocabularies)[number];
/** Vocabularies seen in the loaded statements, each with the IRIs that showed it. */
export type QualityCensus = Partial<Record<QualityVocabulary, string[]>>;
const IAO = "http://purl.obolibrary.org/obo/IAO_";
export function qualityVocabulary(iri: string): QualityVocabulary[] {
  const found: QualityVocabulary[] = [];
  if (iri.startsWith(NS.rdfs)) found.push("RDFS");
  if (iri.startsWith(NS.owl)) found.push("OWL");
  if (iri === NS.owl + "deprecated") found.push("owl:deprecated");
  if (iri.startsWith(NS.skos)) found.push("SKOS");
  if (iri.startsWith(NS.dc) || iri.startsWith(NS.dcterms))
    found.push("Dublin Core");
  if (iri.startsWith(IAO)) found.push("IAO");
  return found;
}
/** Predicates from an absent vocabulary are not offered as accepted evidence. */
export const qualityAdmitted = (predicates: string[], census: QualityCensus) =>
  predicates.filter((p) =>
    qualityVocabulary(p).every((v) => v === "OWL" || v === "RDFS" || census[v]),
  );
export const qualityKinds: Kind[] = [
  "Class",
  "Defined",
  "Individual",
  "ObjectProperty",
  "DataProperty",
  "AnnotationProperty",
  "Resource",
  "Datatype",
];
const rule = (
  id: string,
  title: string,
  group: QualityGroup,
  severity: QualitySeverity,
  basis = "Project review policy",
  enabled = true,
  requires?: QualityVocabulary,
) => ({ id, title, group, severity, basis, enabled, requires });
export const qualityRules = [
  rule(
    "label.missing",
    "Missing explicit primary label",
    "Completeness",
    "Warning",
  ),
  rule("label.empty", "Empty primary label", "Naming", "Warning"),
  rule("label.whitespace", "Label whitespace", "Naming", "Warning"),
  rule("label.placeholder", "Placeholder name", "Naming", "Warning"),
  rule("label.duplicate", "Shared primary label", "Naming", "Warning"),
  rule(
    "label.multiple",
    "Multiple labels in one language",
    "Naming",
    "Warning",
  ),
  rule(
    "label.language",
    "Missing configured language",
    "Completeness",
    "Information",
  ),
  rule(
    "label.style",
    "Mixed label naming conventions",
    "Naming",
    "Information",
    "Optional project naming convention",
    false,
  ),
  rule(
    "skos.multiple",
    "Multiple preferred labels in one language",
    "Naming",
    "Violation",
    "SKOS S14",
    true,
    "SKOS",
  ),
  rule(
    "skos.disjoint",
    "Conflicting SKOS label roles",
    "Naming",
    "Violation",
    "SKOS S13",
    true,
    "SKOS",
  ),
  rule(
    "skos.literal",
    "Non-text SKOS label",
    "Naming",
    "Violation",
    "SKOS S12",
    true,
    "SKOS",
  ),
  rule("description.missing", "Missing description", "Completeness", "Warning"),
  rule(
    "definition.missing",
    "Missing dedicated definition",
    "Completeness",
    "Warning",
    "Optional definition policy",
    false,
  ),
  rule(
    "description.repeated",
    "Description repeats the name",
    "Completeness",
    "Information",
  ),
  rule("definition.duplicate", "Shared definition", "Completeness", "Warning"),
  rule(
    "documentation.missing",
    "No examples or editorial notes",
    "Completeness",
    "Information",
    "Optional documentation coverage",
    false,
  ),
  rule(
    "alias.missing",
    "No alternative names",
    "Completeness",
    "Information",
    "Optional alias coverage",
    false,
  ),
  rule("alias.empty", "Empty alternative name", "Naming", "Warning"),
  rule(
    "alias.primary",
    "Alias repeats a primary name",
    "Naming",
    "Information",
  ),
  rule("alias.shared", "Ambiguous alternative name", "Naming", "Warning"),
  rule(
    "alias.legacy",
    "Legacy seeAlso text synonym",
    "Naming",
    "Information",
    "RDFS seeAlso denotes additional information",
  ),
  rule(
    "structure.isolated",
    "Isolated named entity",
    "Structure",
    "Information",
  ),
  rule(
    "structure.component",
    "Disconnected taxonomy component",
    "Structure",
    "Information",
  ),
  rule(
    "structure.parent",
    "No explicit superclass",
    "Structure",
    "Information",
    "Optional hierarchy review",
    false,
  ),
  rule(
    "structure.cycle",
    "Hierarchy cycle or self-link",
    "Structure",
    "Warning",
    "Review: subclass cycles can imply equivalence",
  ),
  rule(
    "structure.declaration",
    "Missing explicit declaration",
    "Structure",
    "Information",
  ),
  rule(
    "structure.type",
    "No explicit domain class",
    "Structure",
    "Information",
  ),
  rule(
    "structure.unresolved",
    "Reference undefined in loaded data",
    "Structure",
    "Information",
  ),
  rule(
    "property.domain",
    "Missing property domain",
    "Structure",
    "Information",
  ),
  rule("property.range", "Missing property range", "Structure", "Information"),
  rule(
    "property.multiple",
    "Multiple domains or ranges",
    "Structure",
    "Warning",
    "RDFS domain/range declarations apply conjunctively",
  ),
  rule(
    "deprecated.boolean",
    "Malformed deprecation value",
    "Retired entities",
    "Warning",
    undefined,
    true,
    "owl:deprecated",
  ),
  rule(
    "deprecated.reference",
    "Reference to a deprecated entity",
    "Retired entities",
    "Warning",
    undefined,
    true,
    "owl:deprecated",
  ),
  rule(
    "deprecated.guidance",
    "No retirement guidance",
    "Retired entities",
    "Information",
    undefined,
    true,
    "owl:deprecated",
  ),
  rule(
    "metadata.missing",
    "Missing ontology metadata",
    "Publication metadata",
    "Information",
    "Optional publication checklist",
    false,
  ),
  rule(
    "analysis.excluded",
    "Excluded from Text Analysis vocabulary",
    "Text Analysis compatibility",
    "Warning",
    "Current Axiom concept-map eligibility",
  ),
];
export interface QualityOptions {
  scope: "ontology" | "namespace" | "branch";
  namespace: string;
  root: string;
  kinds: Kind[];
  groups: QualityGroup[];
  rules: Record<string, QualitySeverity | "Off">;
  labelPredicates: string[];
  descriptionPredicates: string[];
  definitionPredicates: string[];
  replacementPredicates: string[];
  languages: string[];
}
export const qualityDefaultSeverity = (r: (typeof qualityRules)[number]) =>
  r.enabled ? r.severity : ("Off" as const);
export function defaultQualityOptions(): QualityOptions {
  return {
    scope: "ontology",
    namespace: "",
    root: "",
    kinds: [...qualityKinds],
    groups: [...qualityGroups],
    rules: Object.fromEntries(
      qualityRules.map((r) => [r.id, qualityDefaultSeverity(r)]),
    ),
    labelPredicates: [NS.rdfs + "label", NS.skos + "prefLabel"],
    descriptionPredicates: [
      NS.rdfs + "comment",
      NS.skos + "definition",
      NS.dcterms + "description",
      IAO + "0000115",
    ],
    definitionPredicates: [NS.skos + "definition", IAO + "0000115"],
    replacementPredicates: [
      NS.dcterms + "isReplacedBy",
      IAO + "0100001",
      "http://www.geneontology.org/formats/oboInOwl#consider",
    ],
    languages: [],
  };
}
/** A stored `profile` from before the presets were removed is ignored; its saved predicates and severities stay. */
export function readQualityOptions(value: unknown): QualityOptions {
  const v =
    value && typeof value === "object"
      ? (value as Partial<QualityOptions>)
      : {};
  const d = defaultQualityOptions();
  const strings = (a: unknown, fallback: string[]) =>
    Array.isArray(a) && a.every((s) => typeof s === "string")
      ? [...new Set(a.map((s) => s.trim()).filter(Boolean))]
      : fallback;
  return {
    ...d,
    scope: ["ontology", "namespace", "branch"].includes(v.scope ?? "")
      ? v.scope!
      : d.scope,
    namespace: typeof v.namespace === "string" ? v.namespace.trim() : "",
    root: typeof v.root === "string" ? v.root : "",
    kinds: strings(v.kinds, d.kinds).filter((k) =>
      qualityKinds.includes(k as Kind),
    ) as Kind[],
    groups: [
      ...new Set(strings(v.groups, d.groups).map((g) => legacyGroups[g] ?? g)),
    ].filter((g) =>
      qualityGroups.includes(g as QualityGroup),
    ) as QualityGroup[],
    rules: Object.fromEntries(
      qualityRules.map((r) => [
        r.id,
        ["Off", "Violation", "Warning", "Information"].includes(
          v.rules?.[r.id] ?? "",
        )
          ? v.rules![r.id]
          : d.rules[r.id],
      ]),
    ),
    labelPredicates: strings(v.labelPredicates, d.labelPredicates),
    descriptionPredicates: strings(
      v.descriptionPredicates,
      d.descriptionPredicates,
    ),
    definitionPredicates: strings(
      v.definitionPredicates,
      d.definitionPredicates,
    ),
    replacementPredicates: strings(
      v.replacementPredicates,
      d.replacementPredicates,
    ),
    languages: strings(v.languages, []).map((s) => s.toLowerCase()),
  };
}
/** Rules whose vocabulary the census did not find; they are not part of the catalog. */
export const qualityWithdrawn = (census: QualityCensus) =>
  qualityRules
    .filter((r) => r.requires && !census[r.requires])
    .map((r) => r.id);
/** Enabled checks: switched on, in an enabled group, and admitted by the census. */
export const qualityEnabledChecks = (
  options: QualityOptions,
  census: QualityCensus,
) =>
  qualityRules.filter(
    (r) =>
      options.rules[r.id] !== "Off" &&
      options.groups.includes(r.group) &&
      !(r.requires && !census[r.requires]),
  );
export interface QualityFinding {
  id: string;
  rule: string;
  severity: QualitySeverity;
  group: QualityGroup;
  basis: string;
  iri: string;
  label: string;
  kind: string;
  namespace: string;
  message: string;
  suggestion: string;
  evidence: Triple[];
  related: string[];
  signature: string;
}
export interface QualityException {
  ontology: string;
  iri: string;
  rule: string;
  signature: string;
  reason: string;
  /** ISO time the exception was recorded; absent on exceptions from before #44. */
  recorded?: string;
}
export function readQualityExceptions(input: unknown): QualityException[] {
  return Array.isArray(input)
    ? input.filter(
        (e) =>
          e &&
          ["ontology", "iri", "rule", "signature", "reason"].every(
            (k) => typeof e[k] === "string",
          ) &&
          (e.recorded === undefined || typeof e.recorded === "string") &&
          e.reason.trim() &&
          qualityRules.some((r) => r.id === e.rule),
      )
    : [];
}
export interface QualityCoverage {
  rule: string;
  applicable: number;
  affected: number;
  notApplicable: number;
  checked: boolean;
}
export interface QualityReport {
  ontology: string;
  name: string;
  datasetEpoch: number;
  version: number;
  createdAt: string;
  options: QualityOptions;
  scanned: number;
  candidates: number;
  findings: QualityFinding[];
  coverage: QualityCoverage[];
  imports: string[];
  notes: string[];
  census: QualityCensus;
  /** Rule ids the census withdrew; they have no findings and no coverage rows. */
  withdrawn: string[];
  /** Rules that ran. Zero means the scan had nothing to test. */
  enabledChecks: number;
}
export interface QualityStatus {
  id: number;
  state: "running" | "complete" | "canceled" | "failed";
  scanned: number;
  total: number;
  phase: string;
  error?: string;
  report?: QualityReport;
  /** Findings produced before cancellation. Never a complete report. */
  partial?: QualityReport;
}
/** What the settings block shows before a scan runs. */
export interface QualityCensusResult {
  census: QualityCensus;
  kinds: Partial<Record<Kind, number>>;
  /** Why the chosen scope cannot be resolved yet, such as no branch root. */
  scopeError?: string;
}
export interface QualityRepair {
  iri: string;
  label: string;
  predicate: string;
  language: string;
}
export interface QualityPreview {
  token: number;
  datasetEpoch: number;
  version: number;
  statements: Triple[];
  /** Entities described across several graphs; their labels go to the default graph. */
  multiGraph: string[];
}
export const qualityNamespace = (iri: string) =>
  iri.slice(
    0,
    Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"), iri.lastIndexOf(":")) +
      1,
  );
export const qualitySuppression = (
  report: QualityReport,
  finding: QualityFinding,
  exceptions: QualityException[],
) =>
  exceptions.find(
    (e) =>
      e.ontology === report.ontology &&
      e.iri === finding.iri &&
      e.rule === finding.rule &&
      e.signature === finding.signature,
  );
/**
 * `stale` marks a stale export, by the store's current revision or by
 * "settings"; the findings stay those of the recorded revision.
 */
export function qualityExport(
  report: QualityReport,
  exceptions: QualityException[],
  format: "json" | "csv",
  stale?: number | "settings",
) {
  const findings = report.findings.map((f) => ({
    ...f,
    exception: qualitySuppression(report, f, exceptions)?.reason ?? "",
  }));
  const status =
    stale === "settings"
      ? "stale: the scan settings changed after this scan; findings are from revision " +
        report.version +
        " under the recorded configuration"
      : stale !== undefined
        ? "stale: findings are from revision " +
          report.version +
          "; the store was at revision " +
          stale +
          " when exported"
        : report.enabledChecks
          ? "complete"
          : "complete with no checks enabled: not a clean result";
  if (format === "json")
    return JSON.stringify({ status, ...report, findings }, null, 2);
  const headers = [
    "status",
    "ontology",
    "datasetEpoch",
    "version",
    "createdAt",
    "enabledChecks",
    "vocabularyCensus",
    "withdrawnRules",
    "scope",
    "scanConfiguration",
    "scanned",
    "coverage",
    "imports",
    "notes",
    "rule",
    "severity",
    "basis",
    "iri",
    "label",
    "kind",
    "namespace",
    "message",
    "suggestion",
    "evidence",
    "related",
    "exception",
  ];
  const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const rows = findings.length ? findings : [undefined];
  return [
    headers,
    ...rows.map((f) => [
      status,
      report.ontology,
      report.datasetEpoch,
      report.version,
      report.createdAt,
      report.enabledChecks,
      JSON.stringify(report.census),
      JSON.stringify(report.withdrawn),
      report.options.scope,
      JSON.stringify(report.options),
      report.scanned,
      JSON.stringify(report.coverage),
      JSON.stringify(report.imports),
      JSON.stringify(report.notes),
      f?.rule,
      f?.severity,
      f?.basis,
      f?.iri,
      f?.label,
      f?.kind,
      f?.namespace,
      f?.message,
      f?.suggestion,
      JSON.stringify(f?.evidence ?? []),
      JSON.stringify(f?.related ?? []),
      f?.exception,
    ]),
  ]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
