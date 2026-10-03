import { NS, type Kind, type Triple } from "../domain/model";

export const qualityGroups = [
  "Completeness",
  "Naming",
  "Structure",
  "Deprecated entities",
  "Ontology metadata",
  "Axiom compatibility",
] as const;
export type QualitySeverity = "Violation" | "Warning" | "Information";
export type QualityGroup = (typeof qualityGroups)[number];
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
  basis = "Axiom review policy",
  enabled = true,
) => ({ id, title, group, severity, basis, enabled });
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
  ),
  rule(
    "skos.disjoint",
    "Conflicting SKOS label roles",
    "Naming",
    "Violation",
    "SKOS S13",
  ),
  rule(
    "skos.literal",
    "Non-text SKOS label",
    "Naming",
    "Violation",
    "SKOS S12",
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
    "Deprecated entities",
    "Warning",
  ),
  rule(
    "deprecated.reference",
    "Reference to a deprecated entity",
    "Deprecated entities",
    "Warning",
  ),
  rule(
    "deprecated.guidance",
    "No retirement guidance",
    "Deprecated entities",
    "Information",
  ),
  rule(
    "metadata.missing",
    "Missing ontology metadata",
    "Ontology metadata",
    "Information",
    "Optional publication checklist",
    false,
  ),
  rule(
    "analysis.excluded",
    "Excluded from Text Analysis vocabulary",
    "Axiom compatibility",
    "Warning",
    "Current Axiom concept-map eligibility",
  ),
];
export interface QualityOptions {
  profile: "Axiom" | "SKOS" | "OBO-inspired";
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
export function defaultQualityOptions(
  profile: QualityOptions["profile"] = "Axiom",
): QualityOptions {
  return {
    profile,
    scope: "ontology",
    namespace: "",
    root: "",
    kinds: [...qualityKinds],
    groups: [...qualityGroups],
    rules: Object.fromEntries(
      qualityRules.map((r) => [r.id, !r.enabled ? "Off" : r.severity]),
    ),
    labelPredicates:
      profile === "SKOS"
        ? [NS.skos + "prefLabel"]
        : [NS.rdfs + "label", NS.skos + "prefLabel"],
    descriptionPredicates: [
      NS.rdfs + "comment",
      NS.skos + "definition",
      NS.dcterms + "description",
      "http://purl.obolibrary.org/obo/IAO_0000115",
    ],
    definitionPredicates: [
      NS.skos + "definition",
      "http://purl.obolibrary.org/obo/IAO_0000115",
    ],
    replacementPredicates: [
      NS.dcterms + "isReplacedBy",
      "http://purl.obolibrary.org/obo/IAO_0100001",
      "http://www.geneontology.org/formats/oboInOwl#consider",
    ],
    languages: [],
    ...(profile === "OBO-inspired"
      ? {
          rules: Object.fromEntries(
            qualityRules.map((r) => [
              r.id,
              ["label.missing", "definition.missing"].includes(r.id)
                ? "Violation"
                : r.enabled
                  ? r.severity
                  : "Off",
            ]),
          ),
        }
      : {}),
  };
}
export function readQualityOptions(value: unknown): QualityOptions {
  const v =
    value && typeof value === "object"
      ? (value as Partial<QualityOptions>)
      : {};
  const d = defaultQualityOptions(
    ["Axiom", "SKOS", "OBO-inspired"].includes(v.profile ?? "")
      ? v.profile
      : undefined,
  );
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
    groups: strings(v.groups, d.groups).filter((g) =>
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
}
export function readQualityExceptions(input: unknown): QualityException[] {
  return Array.isArray(input)
    ? input.filter(
        (e) =>
          e &&
          ["ontology", "iri", "rule", "signature", "reason"].every(
            (k) => typeof e[k] === "string",
          ) &&
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
}
export interface QualityStatus {
  id: number;
  state: "running" | "complete" | "canceled" | "failed";
  scanned: number;
  total: number;
  phase: string;
  error?: string;
  report?: QualityReport;
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
export function qualityExport(
  report: QualityReport,
  exceptions: QualityException[],
  format: "json" | "csv",
) {
  const findings = report.findings.map((f) => ({
    ...f,
    exception: qualitySuppression(report, f, exceptions)?.reason ?? "",
  }));
  if (format === "json")
    return JSON.stringify({ ...report, findings }, null, 2);
  const headers = [
    "ontology",
    "datasetEpoch",
    "version",
    "createdAt",
    "profile",
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
      report.ontology,
      report.datasetEpoch,
      report.version,
      report.createdAt,
      report.options.profile,
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
