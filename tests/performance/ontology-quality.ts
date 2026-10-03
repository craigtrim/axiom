/** Non-functional scan measurements, separate from the functional test suite.
 * node --import tsx tests/performance/ontology-quality.ts [ontology-file]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseRdf, storeFromRdf } from "../../src/domain/rdf-io";
import { QualityJobs } from "../../src/domain/quality-jobs";
import { defaultQualityOptions } from "../../src/shared/ontology-quality";
const source = process.argv[2];
const text = source
  ? await readFile(source, "utf8")
  : '@prefix : <https://performance.test/#>. @prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. :Root a owl:Class; rdfs:label "Root". ' +
    Array.from(
      { length: 12000 },
      (_, i) =>
        `:C${i} a owl:Class; rdfs:subClassOf :Root${i % 3 ? '; rdfs:label "Course ' + i + '"' : ""}.`,
    ).join("\n");
const store = storeFromRdf(
  (
    await parseRdf(
      text,
      source ?? "synthetic.ttl",
      source
        ? pathToFileURL(path.resolve(source)).href
        : "https://performance.test/",
    )
  ).triples,
  source ?? "Synthetic 12001 classes",
);
const jobs = new QualityJobs(),
  before = process.memoryUsage(),
  start = performance.now();
const job = jobs.start(store, 1, defaultQualityOptions()),
  capturedMs = performance.now() - start;
let last = performance.now(),
  maxTickGapMs = 0;
while (jobs.status(job.id).state === "running") {
  await new Promise((r) => setTimeout(r, 10));
  const now = performance.now();
  maxTickGapMs = Math.max(maxTickGapMs, now - last);
  last = now;
}
const elapsedMs = performance.now() - start,
  completed = jobs.status(job.id);
if (!completed.report) throw Error(completed.error ?? "Scan incomplete");
const cancel = jobs.start(store, 1, defaultQualityOptions()),
  cancelStart = performance.now();
jobs.cancel(cancel.id);
const result = {
  source: source ?? "synthetic",
  entities: completed.report.scanned,
  triples: store.tbox.length,
  findings: completed.report.findings.length,
  captureMs: capturedMs,
  elapsedMs,
  maxTickGapMs,
  cancellationMs: performance.now() - cancelStart,
  cancellationState: jobs.status(cancel.id).state,
  heapDeltaBytes: process.memoryUsage().heapUsed - before.heapUsed,
  rssBytes: process.memoryUsage().rss,
  note: "Capture is synchronous; ticks measure cooperative scan scheduling. Memory includes reports and a second captured/canceled scan. No pass/fail timing threshold is asserted.",
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  source
    ? "artifacts/issue-42-real-performance.json"
    : "artifacts/issue-42-synthetic-performance.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
