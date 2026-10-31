// craigtrim/axiom#188: an export temp file stays tracked until it is gone, and none is created once the quit sweep has run.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultExportOptions } from "../../src/shared/export";
import type { BrowserWindow, WebContents } from "electron";
const mocks = vi.hoisted(() => ({
  file: "",
  failWrite: false,
  failRemove: false,
  locked: "",
  failOpen: false,
  lockTemps: false,
}));
vi.mock("electron", () => ({
  app: {},
  Menu: {},
  BrowserWindow: class {},
  clipboard: {},
  nativeImage: {},
  ClipboardItem: class {},
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: mocks.file }),
  },
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
      if (mocks.failWrite) throw Error("The share went away.");
      return fs.writeFile(...args);
    },
    rm: async (...args: Parameters<typeof fs.rm>) => {
      if (mocks.failRemove) throw Error("The file is locked.");
      return fs.rm(...args);
    },
  };
});
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return {
    ...fs,
    rmSync: (...args: Parameters<typeof fs.rmSync>) => {
      if (
        args[0] === mocks.locked ||
        (mocks.lockTemps && String(args[0]).endsWith(".axiom-export.tmp"))
      )
        throw Error("EBUSY: resource busy or locked");
      return fs.rmSync(...args);
    },
    // Windows can run out of descriptors after CreateFileW has already made the file.
    openSync: (...args: Parameters<typeof fs.openSync>) => {
      if (mocks.failOpen) {
        fs.writeFileSync(args[0], "");
        throw Error("EMFILE: too many open files");
      }
      return fs.openSync(...args);
    },
  };
});
const owner = {} as BrowserWindow,
  report = {
    options: {
      ...defaultExportOptions,
      content: "report" as const,
      format: "json" as const,
      includeGraph: false,
      includeStatements: false,
    },
    datasetEpoch: 1,
    version: 1,
    iris: [],
  },
  request = async (method: string) =>
    method === "state"
      ? { datasetEpoch: 1, version: 1 }
      : {
          ontology: { name: "Temps" },
          entities: [],
          triples: [],
          graph: {},
          generatedAt: "2026-10-31T00:00:00Z",
          datasetEpoch: 1,
          version: 1,
        };
const contents = {
    id: 7,
    isDestroyed: () => false,
    on: () => contents,
    once: () => contents,
  } as unknown as WebContents,
  stream = {
    options: { ...defaultExportOptions, format: "png" as const },
    datasetEpoch: 1,
    version: 1,
    iris: [],
    encoding: "bytes" as const,
    width: 10,
    height: 10,
  };
let directory: string;
// Each test loads export-service afresh, so the quit sweep of one does not carry into the next.
const load = () => import("../../src/main/export-service");
beforeEach(() => {
  vi.resetModules();
  directory = mkdtempSync(path.join(tmpdir(), "axiom-temps-"));
  mocks.file = path.join(directory, "report.json");
  mocks.failWrite = mocks.failRemove = false;
  mocks.locked = "";
  mocks.failOpen = mocks.lockTemps = false;
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
it("writes a report through a temp file and leaves only the report", async () => {
  const { exportDocument } = await load();
  await expect(exportDocument(report, owner, request)).resolves.toBe(
    mocks.file,
  );
  expect(readdirSync(directory)).toEqual(["report.json"]);
});
it("keeps a temp it could not remove tracked, so the quit sweep removes it", async () => {
  const { exportDocument, abandonExportStreams } = await load();
  mocks.failWrite = mocks.failRemove = true;
  await expect(exportDocument(report, owner, request)).rejects.toThrow(
    "The share went away.",
  );
  expect(readdirSync(directory)).toHaveLength(1);
  mocks.failRemove = false;
  abandonExportStreams();
  expect(readdirSync(directory)).toEqual([]);
});
it("creates no temp file once the quit sweep has run", async () => {
  const { exportDocument, openExportStream, abandonExportStreams } =
    await load();
  abandonExportStreams();
  await expect(exportDocument(report, owner, request)).rejects.toThrow(
    "Axiom is closing.",
  );
  mocks.file = path.join(directory, "diagram.png");
  await expect(
    openExportStream(stream, owner, contents, request),
  ).rejects.toThrow("Axiom is closing.");
  expect(readdirSync(directory)).toEqual([]);
});
it("sweeps every other temp at quit when one cannot be removed", async () => {
  const { exportDocument, abandonExportStreams } = await load();
  mocks.failWrite = mocks.failRemove = true;
  for (const name of ["first.json", "second.json"]) {
    mocks.file = path.join(directory, name);
    await expect(exportDocument(report, owner, request)).rejects.toThrow(
      "The share went away.",
    );
  }
  // The first temp tracked is the first swept, so a sweep that stopped there would keep the second.
  const locked = readdirSync(directory).find((name) =>
    name.startsWith("first.json."),
  )!;
  mocks.locked = path.join(directory, locked);
  expect(() => abandonExportStreams()).not.toThrow();
  expect(readdirSync(directory)).toEqual([locked]);
});
it("removes a temp whose creation failed after making the file, or leaves it to the quit sweep", async () => {
  const { exportDocument, abandonExportStreams } = await load();
  mocks.failOpen = true;
  await expect(exportDocument(report, owner, request)).rejects.toThrow(
    "EMFILE",
  );
  expect(readdirSync(directory)).toEqual([]);
  mocks.lockTemps = true;
  await expect(exportDocument(report, owner, request)).rejects.toThrow(
    "EMFILE",
  );
  expect(readdirSync(directory)).toHaveLength(1);
  mocks.failOpen = mocks.lockTemps = false;
  abandonExportStreams();
  expect(readdirSync(directory)).toEqual([]);
});
it("cancels a stream whose temp cannot be removed without failing, and leaves the temp to the quit sweep", async () => {
  const { openExportStream, cancelExportStream, abandonExportStreams } =
    await load();
  mocks.file = path.join(directory, "diagram.png");
  const id = await openExportStream(stream, owner, contents, request);
  expect(readdirSync(directory)).toHaveLength(1);
  mocks.failRemove = true;
  await expect(cancelExportStream(id!, 7)).resolves.toBeUndefined();
  expect(readdirSync(directory)).toHaveLength(1);
  mocks.failRemove = false;
  abandonExportStreams();
  expect(readdirSync(directory)).toEqual([]);
});
