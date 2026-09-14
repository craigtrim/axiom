import { parentPort, workerData } from "node:worker_threads";
import {
  mkdir,
  appendFile,
  writeFile,
  opendir,
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { MetadataReader } from "./metadata-reader";
import {
  scanTriples,
  evidenceTriples,
  completionTriples,
  ntriples,
} from "../domain/provenance";
import type {
  ProvenanceStatus,
  ProvenanceOptions,
  FileEvidence,
} from "../shared/provenance";
const { root, directory, id, options, helpers } = workerData as {
  root: string;
  directory: string;
  id: string;
  options: ProvenanceOptions;
  helpers: string;
};
const signal = new AbortController(),
  reader = new MetadataReader(helpers, options, signal.signal);
parentPort!.on("message", () => {
  signal.abort();
  reader.close();
});
const s: ProvenanceStatus = {
  id,
  root,
  status: "running",
  startedAt: new Date().toISOString(),
  entries: 0,
  files: 0,
  directories: 0,
  issues: 0,
  recent: [],
  evidencePath: path.join(directory, "evidence.jsonl"),
  rdfPath: path.join(directory, "provenance.nt"),
};
const fileIds = new Map<string, Set<string>>();
const publish = () => parentPort!.postMessage(structuredClone(s));
async function record(e: FileEvidence, metadataOnly = false) {
  if (!metadataOnly) {
    s.entries++;
    if (e.directory) s.directories++;
    else s.files++;
  }
  const id = (e.metadata.windows as any)?.native?.value?.fileId?.value
    ?.fileId128;
  if (id) {
    const volume = path.parse(e.path).root;
    const ids = fileIds.get(volume) ?? new Set<string>();
    ids.add(id);
    fileIds.set(volume, ids);
  }
  s.issues += e.issues.length;
  s.current = e.path;
  s.recent = [
    {
      path: e.path,
      status: e.issues.length ? "Review coverage" : "Collected",
      issues: e.issues.length,
    },
    ...s.recent,
  ].slice(0, 30);
  await appendFile(s.evidencePath!, JSON.stringify(e) + "\n");
  await appendFile(s.rdfPath!, ntriples(evidenceTriples(e, id)));
  publish();
}
async function walk(file: string, parent?: string) {
  if (signal.signal.aborted) return;
  if (options.maxEntries && s.entries >= options.maxEntries) {
    s.message =
      "Stopped at the configured entry limit; remaining entries were not observed.";
    signal.abort();
    return;
  }
  if (
    path.resolve(file).toLowerCase() === path.resolve(directory).toLowerCase()
  ) {
    await record({
      path: file,
      parent,
      observedAt: new Date().toISOString(),
      directory: true,
      reparse: false,
      metadata: {
        enumeration: {
          status: "not-read",
          reason: "This collection is writing its output here.",
        },
      },
      issues: [
        "Current collection output is excluded to avoid observing files being written by this collection.",
      ],
    });
    return;
  }
  s.current = file;
  publish();
  const e = await reader.collect(file, parent);
  await record(e);
  if (!e.directory || e.reparse || signal.signal.aborted) return;
  try {
    const dir = await opendir(file);
    for await (const child of dir) {
      if (signal.signal.aborted) break;
      await walk(path.join(file, child.name), file);
    }
  } catch (error) {
    const failure: FileEvidence = {
      path: file,
      parent,
      observedAt: new Date().toISOString(),
      directory: true,
      reparse: false,
      metadata: {
        enumeration: {
          status: "unavailable",
          message: (error as Error).message,
        },
      },
      issues: ["Directory enumeration: " + (error as Error).message],
    };
    await record(failure);
  }
}
async function run() {
  try {
    if (!(await lstat(root)).isDirectory()) throw Error("Select a folder.");
    const canonical = await realpath(root);
    if (
      path.resolve(canonical).toLowerCase() !== path.resolve(root).toLowerCase()
    )
      throw Error("Select the actual folder instead of a reparse-point alias.");
    await mkdir(directory, { recursive: true });
    await writeFile(s.evidencePath!, "");
    await writeFile(s.rdfPath!, ntriples(scanTriples(s, options)));
    publish();
    await walk(root);
    if (!signal.signal.aborted)
      for (const [volume, ids] of fileIds) {
        s.current = "Reading existing change journal: " + volume;
        publish();
        let value: any;
        try {
          value = await reader.journal(volume, [...ids]);
        } catch (e) {
          value = { status: "unavailable", message: (e as Error).message };
        }
        await record(
          {
            path: root,
            observedAt: new Date().toISOString(),
            directory: true,
            reparse: false,
            metadata: { existingChangeJournal: value },
            issues:
              value.status === "collected"
                ? []
                : [
                    "Existing change journal: " +
                      (value.message ?? value.reason ?? value.status),
                  ],
          },
          true,
        );
      }
    s.status = signal.signal.aborted ? "cancelled" : "complete";
    s.message ??=
      s.status === "complete"
        ? "Collection finished. Review coverage before opening the ontology."
        : "Collection cancelled. Completed observations are available for review.";
  } catch (e) {
    s.status = "error";
    s.message = (e as Error).message;
  } finally {
    s.endedAt = new Date().toISOString();
    s.current = undefined;
    reader.close();
    try {
      await appendFile(s.rdfPath!, ntriples(completionTriples(s)));
      await writeFile(
        path.join(directory, "summary.json"),
        JSON.stringify({ status: s, options }, null, 2),
      );
    } catch {}
    publish();
    parentPort!.close();
  }
}
void run();
