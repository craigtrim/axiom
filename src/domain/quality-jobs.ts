import type { Store } from "./store";
import { NS, type Triple } from "./model";
import { validResource, validateStatement } from "./rdf-model";
import { qualityInput, scanQuality } from "./ontology-quality";
import {
  readQualityOptions,
  type QualityStatus,
  type QualityPreview,
  type QualityRepair,
} from "../shared/ontology-quality";

export class QualityJobs {
  private sequence = 0;
  private job?: QualityStatus;
  private preview?: QualityPreview;
  private previewSequence = 0;
  start(store: Store, epoch: number, options: unknown) {
    if (this.job?.state === "running") this.job.state = "canceled";
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
          Object.assign(job, next.value);
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
      job.phase = "Canceled — incomplete";
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
      throw Error(
        "The ontology changed. Run the scan again before reviewing labels.",
      );
    if (!Array.isArray(rows) || !rows.length)
      throw Error("Select labels to preview.");
    const options = readQualityOptions(report.options),
      selected = new Set<string>();
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
        throw Error("Invalid proposed label.");
      if (selected.has(r.iri))
        throw Error("Choose one proposed label per entity.");
      selected.add(r.iri);
      if (
        !report.findings.some(
          (f) => f.iri === r.iri && f.rule === "label.missing",
        ) ||
        !store.entities.has(r.iri)
      )
        throw Error(
          "Only scanned entities with missing labels can be repaired here.",
        );
      const existing = store.tbox.filter((t) => t.subject === r.iri);
      if (existing.some((t) => options.labelPredicates.includes(t.predicate)))
        throw Error("A primary label already exists. Review it in Details.");
      const graphs = [...new Set(existing.map((t) => t.graph))];
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
      validateStatement(t);
      return t;
    });
    this.preview = {
      token: ++this.previewSequence,
      datasetEpoch: epoch,
      version: store.version,
      statements,
    };
    return structuredClone(this.preview);
  }
  apply(store: Store, epoch: number, version: number, token: number) {
    const p = this.preview;
    if (
      !p ||
      p.token !== token ||
      p.datasetEpoch !== epoch ||
      p.version !== store.version ||
      version !== p.version
    )
      throw Error(
        "The ontology or preview changed. Preview the labels again before applying.",
      );
    this.preview = undefined;
    store.addQualityLabels(p.statements);
    return p.statements.length;
  }
}
