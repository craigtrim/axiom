// craigtrim/axiom#208: one hosted journey crosses both old quotas and V8's string ceiling.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { freemem, totalmem } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DomainProcess, heapCeilingMiB } from "../src/main/domain-process";
import { domainRuntimePaths } from "../src/main/node-runtime";
import type { Triple } from "../src/domain/model";
import type { SavedEditorDrafts } from "../src/shared/editor-state";
import type { SourceDocument } from "../src/shared/source";
import type {
  CheckpointSummary,
  DataRuntimeInfo,
} from "../src/shared/protocol";

if (
  process.platform !== "win32" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
  process.argv.length !== 2
)
  throw Error(
    "The large ontology journey requires a GitHub-hosted Windows runner.",
  );

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "artifacts/large-ontology");
const profile = path.join(output, "profile");
const input = path.join(output, "schools-4000000.ttl");
const workspace = path.join(output, "schools-4000000.axiom");
const runtime = domainRuntimePaths(root, "", false);
const base = "https://example.test/schools#";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
const owl = "http://www.w3.org/2002/07/owl#";
const xsd = "http://www.w3.org/2001/XMLSchema#";
const triples = 4_000_000;
const schools = 307_692;
const rowBytes = 555;
const workbench = { version: 1 as const, theme: "light" as const };
const phases: Record<string, unknown>[] = [];
const processes: Record<string, unknown>[] = [];
const shutdowns: Record<string, unknown>[] = [];
const report: Record<string, unknown> = {
  issue: 208,
  commit: process.env.GITHUB_SHA,
  startedAt: new Date().toISOString(),
  totalMemory: totalmem(),
  heapCeilingMiB: heapCeilingMiB(totalmem()),
  triples,
  schools,
  phases,
  processes,
  shutdowns,
  passed: false,
};

async function phase<T>(name: string, action: () => Promise<T>): Promise<T> {
  const started = performance.now();
  console.log("Large ontology: " + name);
  try {
    const value = await action();
    phases.push({
      name,
      milliseconds: performance.now() - started,
      passed: true,
    });
    return value;
  } catch (error) {
    phases.push({
      name,
      milliseconds: performance.now() - started,
      passed: false,
    });
    throw error;
  }
}

function schoolRow(index: number) {
  const id = String(index).padStart(6, "0");
  const start = `:S${id} a :School; rdfs:label "School ${id}"; rdfs:comment "`;
  const end = `"; rdfs:seeAlso "Alternative ${id}", "Alias ${id}"; owl:sameAs wd:Q${id}; :hasQID "Q${id}"; :hasType "education"; :hasCountry "US"; :establishedYear "${1800 + (index % 220)}"; :locatedIn "Town ${id}"; :hasWebsite "https://example.org/school/${id}"; :hasCoordinates "40.00,-75.00" .\n`;
  const description = `Generated school ${id} follows issue 122 with aliases, identity links, and seven annotation values. `;
  const padding = rowBytes - start.length - description.length - end.length;
  assert(padding >= 0);
  return start + description + "x".repeat(padding) + end;
}

async function generateFixture() {
  const digest = createHash("sha256");
  let bytes = 0;
  async function* chunks() {
    // Prefixes are not statements; these four declarations plus 13 per school are exact.
    yield `@prefix : <${base}> .\n@prefix rdfs: <${rdfs}> .\n@prefix owl: <${owl}> .\n@prefix wd: <http://www.wikidata.org/entity/> .\n:School a owl:Class; rdfs:label "School" .\n:hasQID a owl:AnnotationProperty .\n:hasType a owl:AnnotationProperty .\n`;
    for (let first = 0; first < schools; first += 128) {
      const rows: string[] = [];
      for (let index = first; index < Math.min(first + 128, schools); index++)
        rows.push(schoolRow(index));
      yield rows.join("");
    }
  }
  async function* measured() {
    for await (const chunk of chunks()) {
      bytes += Buffer.byteLength(chunk);
      digest.update(chunk);
      yield chunk;
    }
  }
  await pipeline(Readable.from(measured()), createWriteStream(input));
  assert.equal(4 + schools * 13, triples);
  assert(
    bytes > 128 * 1024 ** 2,
    "The fixture must exceed the old import byte quota.",
  );
  assert.equal((await stat(input)).size, bytes);
  return { bytes, sha256: digest.digest("hex"), rowBytes };
}

type Counts = {
  entities: number;
  tripleCount: number;
  individualCount: number;
  classCount: number;
  propertyCount: number;
};
class Probe {
  readonly process = new DomainProcess(runtime.entrypoint, {
    execPath: runtime.executable,
  });
  counts?: Counts;
  private serial = 0;
  private stopped = false;
  private pending = new Map<
    number,
    {
      resolve(value: any): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(readonly name: string) {
    this.process.on("message", (packet) => {
      if (packet.event?.type === "state") {
        const data = packet.event.data;
        // Drop the catalog after counting it; never ask for or retain whole workspace replies.
        this.counts = {
          entities: Array.isArray(data.entities)
            ? data.entities.length
            : (this.counts?.entities ?? 0),
          tripleCount: data.tripleCount,
          individualCount: data.individualCount,
          classCount: data.classCount,
          propertyCount: data.propertyCount,
        };
      }
      const pending = this.pending.get(packet.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(packet.id);
      if (packet.error)
        pending.reject(Object.assign(Error(packet.error), packet));
      else pending.resolve(packet.value);
    });
    const failed = (error: Error) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
    };
    this.process.on("error", failed);
    this.process.on("exit", (code, signal) => {
      this.stopped = true;
      failed(
        Error(
          `The ${name} data process stopped (${signal ?? code}): ${this.process.diagnostics}`,
        ),
      );
    });
  }
  request<T = any>(method: string, args: Record<string, unknown> = {}) {
    return new Promise<T>((resolve, reject) => {
      if (this.stopped)
        return reject(Error("The acceptance data process already stopped."));
      const id = ++this.serial;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.process.child.kill();
        reject(Error(`${this.name}: ${method} exceeded ten minutes.`));
      }, 600_000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.postMessage({ id, method, args }, (error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }
  async stop() {
    const child = this.process.child;
    const started = performance.now();
    const killCalls: Record<string, unknown>[] = [];
    const shutdown: Record<string, unknown> = {
      name: this.name,
      pid: child.pid,
      startedAt: new Date().toISOString(),
      exitCodeAtStart: child.exitCode,
      signalAtStart: child.signalCode,
      killCalls,
    };
    const exited = (code: number | null, signal: NodeJS.Signals | null) => {
      shutdown.rawExit = {
        code,
        signal,
        at: new Date().toISOString(),
        milliseconds: performance.now() - started,
      };
    };
    child.once("exit", exited);
    const originalKill = child.kill;
    child.kill = (signal?: NodeJS.Signals | number) => {
      const call: Record<string, unknown> = {
        at: new Date().toISOString(),
        milliseconds: performance.now() - started,
        signal: signal ?? "SIGTERM",
      };
      killCalls.push(call);
      try {
        const result = Reflect.apply(originalKill, child, [signal]);
        call.result = result;
        return result;
      } catch (error) {
        call.error = String(error);
        throw error;
      }
    };
    try {
      const code = await this.process.terminate();
      shutdown.terminateMilliseconds = performance.now() - started;
      shutdown.returnedCode = code;
      await writeFile(
        path.join(output, this.name + ".stderr.log"),
        this.process.diagnostics,
      );
      assert.equal(code, 0, "The data process must shut down cleanly.");
    } finally {
      child.kill = originalKill;
      child.off("exit", exited);
      shutdown.exitCode = child.exitCode;
      shutdown.signal = child.signalCode;
      shutdown.connected = child.connected;
      shutdown.diagnostics = this.process.diagnostics;
      shutdowns.push(shutdown);
    }
  }
}

async function configured(name: string, directory = profile) {
  const probe = new Probe(name);
  active = probe;
  const info = await probe.request<DataRuntimeInfo>("configureDataService", {
    directory,
    appPath: root,
    resourcesPath: path.join(root, "node_modules/electron/dist/resources"),
    packaged: false,
  });
  assert.equal(info.pid, probe.process.pid);
  assert.equal(info.pointerCompression, false);
  assert.equal(info.totalMemory, totalmem());
  assert(info.heapSizeLimit >= heapCeilingMiB(totalmem()) * 1024 ** 2);
  processes.push({ name, ...info, freeMemoryAtStart: freemem() });
  return probe;
}
function assertCounts(probe: Probe, expected?: Counts) {
  assert(probe.counts, "Loading must publish the real ontology counts.");
  assert.equal(probe.counts.tripleCount, triples);
  assert.equal(probe.counts.individualCount, schools);
  assert(
    probe.counts.entities > 200_000,
    "The old entity quota must be exceeded.",
  );
  if (expected) assert.deepEqual(probe.counts, expected);
  return { ...probe.counts };
}
const tuple = (predicate: string, value: string, literal = true) =>
  JSON.stringify([
    predicate,
    value,
    literal,
    literal ? xsd + "string" : "",
    "",
    "",
  ]);
async function assertSentinels(probe: Probe) {
  const sentinels: Record<string, string> = {};
  for (const index of [0, Math.floor(schools / 2), schools - 1]) {
    const id = String(index).padStart(6, "0");
    const iri = base + "S" + id;
    const document = await probe.request<{
      entity: { kind: string };
      statements: Triple[];
    }>("entityDocument", { iri });
    assert.equal(document.entity.kind, "Individual");
    const expected = [
      tuple(rdf + "type", base + "School", false),
      tuple(rdfs + "label", "School " + id),
      tuple(
        rdfs + "comment",
        schoolRow(index).match(/rdfs:comment "([^"]*)"/)![1],
      ),
      tuple(rdfs + "seeAlso", "Alternative " + id),
      tuple(rdfs + "seeAlso", "Alias " + id),
      tuple(owl + "sameAs", "http://www.wikidata.org/entity/Q" + id, false),
      ...Object.entries({
        hasQID: "Q" + id,
        hasType: "education",
        hasCountry: "US",
        establishedYear: String(1800 + (index % 220)),
        locatedIn: "Town " + id,
        hasWebsite: "https://example.org/school/" + id,
        hasCoordinates: "40.00,-75.00",
      }).map(([predicate, value]) => tuple(base + predicate, value)),
    ].sort();
    const actual = document.statements
      .map((statement) => {
        assert.equal(statement.subject, iri);
        const term = statement.object;
        return JSON.stringify([
          statement.predicate,
          term.value,
          term.literal,
          term.datatype ?? "",
          term.language ?? "",
          statement.graph ?? "",
        ]);
      })
      .sort();
    assert.deepEqual(
      actual,
      expected,
      "Every sentinel annotation must survive unchanged.",
    );
    sentinels[id] = createHash("sha256")
      .update(actual.join("\n"))
      .digest("hex");
  }
  return sentinels;
}
async function checkpoint(probe: Probe) {
  const saved = await probe.request<CheckpointSummary>("checkpointPrepare");
  assert.equal(typeof saved.id, "string");
  assert.equal(saved.hasDrafts, false);
  assert(
    JSON.stringify(saved).length < 2048,
    "Checkpoint IPC must contain metadata only.",
  );
  for (const key of ["text", "chunks", "workspace", "entities", "tbox"])
    assert(!Object.hasOwn(saved, key));
  return saved;
}
async function inspectJson(
  file: string,
  format: string,
  maxStringLength: number,
) {
  const digest = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  let characters = 0,
    bytes = 0,
    prefix = "";
  for await (const chunk of createReadStream(file)) {
    bytes += chunk.length;
    digest.update(chunk);
    const text = decoder.write(chunk);
    characters += text.length;
    if (prefix.length < 8192) prefix += text.slice(0, 8192 - prefix.length);
  }
  characters += decoder.end().length;
  assert.equal(prefix.match(/"format"\s*:\s*"([^"]+)"/)?.[1], format);
  assert.equal(prefix.match(/"version"\s*:\s*(\d+)/)?.[1], "1");
  assert(
    characters > maxStringLength,
    "The persisted document must exceed V8 MAX_STRING_LENGTH.",
  );
  return {
    bytes,
    characters,
    sha256: digest.digest("hex"),
    format,
    version: 1,
  };
}
function textDigest(text: string) {
  const hash = createHash("sha256");
  for (let offset = 0; offset < text.length; offset += 65536)
    hash.update(text.slice(offset, offset + 65536));
  return hash.digest("hex");
}

async function verifyLargeDrafts(maxStringLength: number) {
  // Finish the ontology processes before this independent aggregate-IPC check.
  global.gc?.();
  const directory = path.join(output, "draft-profile");
  await mkdir(directory, { recursive: true });
  const draftBytes = 270 * 1024 ** 2;
  assert(draftBytes * 2 > maxStringLength);
  assert(draftBytes < maxStringLength);
  const saving = await configured("large-drafts-save", directory);
  await saving.request("new", { blank: true });
  const loaded = await saving.request<SourceDocument>("sourceDocument", {
    format: "turtle",
  });
  const prefix = loaded.text + "\n# ";
  let text: string | undefined =
    prefix + "x".repeat(draftBytes - prefix.length - 1) + "\n";
  const expectedHash = textDigest(text);
  let editorDrafts: SavedEditorDrafts | undefined = {
    version: 1,
    storeVersion: loaded.version,
    entities: [],
    entitySources: [],
    source: { text, loaded: { ...loaded, text } },
  };
  // These two valid string fields exceed MAX_STRING_LENGTH when framed together.
  const preparing = saving.request<CheckpointSummary>("checkpointPrepare", {
    editorDrafts,
  });
  editorDrafts = undefined;
  text = undefined;
  const saved = await preparing;
  assert.equal(saved.hasDrafts, true);
  assert(JSON.stringify(saved).length < 2048);
  try {
    await saving.request("checkpointSession", { id: saved.id, workbench });
  } finally {
    await saving.request("checkpointRelease", { id: saved.id });
  }
  await saving.stop();
  active = undefined;
  global.gc?.();
  const session = await inspectJson(
    path.join(directory, "last-session.json"),
    "axiom-session",
    maxStringLength,
  );
  const restoring = await configured("large-drafts-restore", directory);
  const result = await restoring.request("restoreSession", {
    preferences: workbench,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.recovered, false);
  const source = result.session?.editorDrafts?.source;
  assert(
    source,
    "Restoration must return both source draft fields across the real IPC.",
  );
  assert.equal(source.text.length, draftBytes);
  assert.equal(source.loaded.text.length, draftBytes);
  assert.equal(source.loaded.format, "turtle");
  assert.equal(textDigest(source.text), expectedHash);
  assert.equal(textDigest(source.loaded.text), expectedHash);
  await restoring.stop();
  active = undefined;
  return { fieldCharacters: draftBytes, sha256: expectedHash, session };
}

let active: Probe | undefined;
await mkdir(profile, { recursive: true });
try {
  const { stdout } = await promisify(execFile)(
    runtime.executable,
    [
      "-p",
      "JSON.stringify({version:process.version,maxStringLength:require('node:buffer').constants.MAX_STRING_LENGTH})",
    ],
    { windowsHide: true },
  );
  const limits = JSON.parse(stdout) as {
    version: string;
    maxStringLength: number;
  };
  assert(
    Number.isSafeInteger(limits.maxStringLength) && limits.maxStringLength > 0,
  );
  report.runtime = limits;
  report.fixture = await phase(
    "generate 4,000,000 statements incrementally",
    generateFixture,
  );

  const imported = await configured("import");
  const importedResult = await phase(
    "stream the Turtle file into the real Node service",
    () =>
      imported.request<{ triples: number; entities: number }>("importRdfFile", {
        file: input,
        fileName: path.basename(input),
        baseIRI: base,
      }),
  );
  assert.equal(importedResult.triples, triples);
  const expected = assertCounts(imported);
  assert.equal(importedResult.entities, expected.entities);
  report.counts = expected;
  const sentinels = await phase("verify imported sentinel statements", () =>
    assertSentinels(imported),
  );
  report.sentinels = sentinels;
  await phase("write the autosave checkpoint session", async () => {
    const saved = await checkpoint(imported);
    try {
      await imported.request("checkpointSession", { id: saved.id, workbench });
    } finally {
      await imported.request("checkpointRelease", { id: saved.id });
    }
  });
  await imported.stop();
  active = undefined;
  report.session = await phase(
    "measure streamed session beyond the string ceiling",
    () =>
      inspectJson(
        path.join(profile, "last-session.json"),
        "axiom-session",
        limits.maxStringLength,
      ),
  );

  const restored = await configured("session-restore");
  await phase("restore the session in a fresh Node process", async () => {
    const result = await restored.request("restoreSession", {
      preferences: workbench,
    });
    assert.equal(result.session?.format, "axiom-session");
    assert.equal(result.session.version, 1);
    assert.equal(result.session.sourceBaseIRI, base);
    assert.equal(result.recovered, false);
    assert.deepEqual(result.errors, []);
    assert(!Object.hasOwn(result.session, "workspace"));
    assertCounts(restored, expected);
    assert.deepEqual(await assertSentinels(restored), sentinels);
  });
  await phase(
    "save the restored workspace with its unchanged format",
    async () => {
      const saved = await checkpoint(restored);
      try {
        await restored.request("checkpointWorkspace", {
          id: saved.id,
          file: workspace,
          workbench,
          options: { allowCreate: true },
        });
      } finally {
        await restored.request("checkpointRelease", { id: saved.id });
      }
    },
  );
  report.workspaceCommittedBeforeShutdown = {
    bytes: (await stat(workspace)).size,
  };
  await restored.stop();
  active = undefined;
  report.workspace = await phase(
    "measure streamed workspace beyond the string ceiling",
    () => inspectJson(workspace, "axiom-workspace", limits.maxStringLength),
  );

  const reopened = await configured("workspace-reopen");
  await reopened.request("new", { blank: true });
  await phase(
    "reopen the workspace in another fresh Node process",
    async () => {
      const metadata = await reopened.request("loadWorkspaceFile", {
        file: workspace,
        preferences: workbench,
      });
      assert.equal(metadata.sourceBaseIRI, base);
      assert.equal(metadata.workbench.version, 1);
      assert(!Object.hasOwn(metadata, "workspace"));
      assertCounts(reopened, expected);
      assert.deepEqual(await assertSentinels(reopened), sentinels);
    },
  );
  await reopened.stop();
  active = undefined;
  report.largeDrafts = await phase(
    "round-trip two 270 MiB draft fields through actual Node IPC and session restore",
    () => verifyLargeDrafts(limits.maxStringLength),
  );
  report.passed = true;
} catch (error) {
  report.error =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : String(error);
  process.exitCode = 1;
} finally {
  if (active) {
    try {
      await active.stop();
    } catch (error) {
      report.cleanupError = String(error);
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  report.parentMemory = process.memoryUsage();
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (report.passed)
  console.log(
    "Large ontology: all 4,000,000 statements survived import, autosave, session restore, workspace save and reopen.",
  );
else console.error(report.error);
