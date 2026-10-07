import type { Store } from "./store";
import { NS, type Triple } from "./model";
import { validResource, validateStatement } from "./rdf-model";
import { qualityInput, scanQuality } from "./ontology-quality";
import {
  readQualityOptions,
  qualityCorrection,
  type QualityReport,
  type QualityStatus,
  type QualityPreview,
  type QualityRepair,
} from "../shared/ontology-quality";

export type QualityRejection =
  "edits" | "replaced" | "invalid" | "duplicate" | "repeated";
/** Each rejection names its condition so the pane can say which one fired (craigtrim/axiom#44). */
export const qualityReject = (
  code: QualityRejection,
  detail: string,
  entity = "",
) => Error(`quality-reject:${code}:${encodeURIComponent(entity)}:${detail}`);
export class QualityJobs {
  private sequence = 0;
  private job?: QualityStatus;
  private preview?: QualityPreview;
  private previewSequence = 0;
  private applied = new Set<number>();
  // What a scan has found so far; a canceled job keeps it (craigtrim/axiom#44).
  private partial?: () => QualityReport;
  start(store: Store, epoch: number, options: unknown) {
    if (this.job?.state === "running") this.job.state = "canceled";
    this.partial = undefined;
    this.preview = undefined;
    const job: QualityStatus = {
      id: ++this.sequence,
      state: "running",
      scanned: 0,
      total: 0,
      phase: "Capturing ontology",
    };
    this.job = job;
    // Capture synchronously before yielding; later edits cannot change this input.
    let input;
    try {
      input = qualityInput(store, epoch);
    } catch (error) {
      job.state = "failed";
      job.phase = "Failed";
      job.error = error instanceof Error ? error.message : String(error);
      return { ...job };
    }
    const iterator = scanQuality(input, options);
    const step = () => {
      if (job.state !== "running") return;
      try {
        const next = iterator.next();
        if (next.done) {
          job.report = next.value;
          job.scanned = next.value.scanned;
          job.total = next.value.scanned;
          job.state = "complete";
          job.phase = "Complete";
        } else {
          const { partial, ...progress } = next.value;
          if (partial) this.partial = partial;
          Object.assign(job, progress);
          setTimeout(step, 0);
        }
      } catch (error) {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.phase = "Failed";
      }
    };
    setTimeout(step, 0);
    return { ...job };
  }
  status(id: number) {
    if (id !== this.job?.id)
      throw Error("This quality scan is no longer available. Run it again.");
    return this.job;
  }
  cancel(id: number) {
    const job = this.status(id);
    if (job.state === "running") {
      job.state = "canceled";
      job.phase = "Canceled";
      job.partial = this.partial?.();
    }
    return job;
  }
  prepare(
    store: Store,
    epoch: number,
    id: number,
    rows: unknown,
  ): QualityPreview {
    this.preview = undefined;
    const report = this.status(id).report;
    if (
      !report ||
      report.datasetEpoch !== epoch ||
      report.version !== store.version
    )
      throw qualityReject(
        "edits",
        "The ontology changed. Run the scan again before reviewing labels.",
      );
    if (!Array.isArray(rows) || !rows.length)
      throw qualityReject("invalid", "Select labels to preview.");
    const options = readQualityOptions(report.options),
      selected = new Set<string>(),
      multiGraph: string[] = [];
    const statements = rows.map((r: QualityRepair): Triple => {
      if (
        !r ||
        typeof r.iri !== "string" ||
        typeof r.label !== "string" ||
        !r.label.trim() ||
        typeof r.language !== "string" ||
        typeof r.predicate !== "string" ||
        !options.labelPredicates.includes(r.predicate) ||
        !validResource(r.predicate, false)
      )
        throw qualityReject("invalid", "Invalid proposed label.");
      if (selected.has(r.iri))
        throw qualityReject(
          "duplicate",
          "Choose one proposed label per entity.",
          r.iri,
        );
      selected.add(r.iri);
      if (
        !report.findings.some(
          (f) => f.iri === r.iri && f.rule === "label.missing",
        ) ||
        !store.entities.has(r.iri)
      )
        throw qualityReject(
          "invalid",
          "Only scanned entities with missing labels can be repaired here.",
        );
      const existing = store.tbox.filter((t) => t.subject === r.iri);
      if (existing.some((t) => options.labelPredicates.includes(t.predicate)))
        throw qualityReject(
          "invalid",
          "A primary label already exists. Review it in Details.",
        );
      const graphs = [...new Set(existing.map((t) => t.graph))];
      if (graphs.length > 1) multiGraph.push(r.iri);
      const t: Triple = {
        subject: r.iri,
        predicate: r.predicate,
        object: {
          value: r.label.trim(),
          literal: true,
          ...(r.language
            ? { language: r.language, datatype: NS.rdf + "langString" }
            : { datatype: NS.xsd + "string" }),
        },
        ...(graphs.length === 1 && graphs[0] ? { graph: graphs[0] } : {}),
      };
      try {
        validateStatement(t);
      } catch (error) {
        throw qualityReject("invalid", (error as Error).message);
      }
      return t;
    });
    this.preview = {
      token: ++this.previewSequence,
      datasetEpoch: epoch,
      version: store.version,
      statements,
      multiGraph,
    };
    return structuredClone(this.preview);
  }
  /** Every condition is checked before any statement is written. */
  applyFinding(
    store: Store,
    epoch: number,
    version: number,
    id: number,
    findingId: string,
  ) {
    const job = this.status(id),
      report = job.report;
    if (
      job.state !== "complete" ||
      !report ||
      report.datasetEpoch !== epoch ||
      report.version !== store.version ||
      version !== report.version
    )
      throw qualityReject(
        "edits",
        "The ontology changed. Run the scan again before applying this correction.",
      );
    const finding = report.findings.find((f) => f.id === findingId);
    const statement = finding && qualityCorrection(report, finding);
    if (!statement || !store.entities.has(statement.subject))
      throw qualityReject(
        "invalid",
        "The correction is no longer available for this entity.",
      );
    if (
      store.tbox.some(
        (t) =>
          t.subject === statement.subject &&
          report.options.labelPredicates.includes(t.predicate),
      )
    )
      throw qualityReject(
        "invalid",
        "A primary label already exists. Review it in Details.",
      );
    validateStatement(statement);
    store.addQualityLabels([statement]);
    this.preview = undefined;
    // Label effects cross entity boundaries (duplicates, aliases and analysis
    // eligibility). Run the same rule engine against the new immutable revision
    // before publishing it, keeping this job and its settings current.
    const iterator = scanQuality(qualityInput(store, epoch), report.options);
    for (;;) {
      const next = iterator.next();
      if (next.done) {
        job.report = next.value;
        job.scanned = job.total = next.value.scanned;
        return structuredClone(job);
      }
    }
  }

  /** Every condition is checked before any statement is written. */
  apply(store: Store, epoch: number, version: number, token: number) {
    const p = this.preview;
    if (this.applied.has(token))
      throw qualityReject("repeated", "These additions were already applied.");
    if (!p || p.token !== token)
      throw qualityReject("replaced", "The preview changed. Preview again.");
    if (
      p.datasetEpoch !== epoch ||
      p.version !== store.version ||
      version !== p.version
    )
      throw qualityReject("edits", "The ontology changed. Preview again.");
    const subjects = new Set<string>();
    for (const t of p.statements) {
      if (subjects.has(t.subject))
        throw qualityReject("duplicate", "Duplicate selection.", t.subject);
      subjects.add(t.subject);
      if (!store.entities.has(t.subject))
        throw qualityReject("invalid", "The entity no longer exists.");
    }
    this.preview = undefined;
    store.addQualityLabels(p.statements);
    this.applied.add(token);
    return p.statements.length;
  }
}
