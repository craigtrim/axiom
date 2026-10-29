// craigtrim/axiom#182: crash records carry recent activity and process state, and survive a crash of main.
import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AuditLog } from "../../src/main/audit-log";
import {
  ActivityTrail,
  FailureGate,
  RunLog,
  activityEvents,
  crashDetails,
  dumpList,
  processTable,
  summariseArgs,
  unreportedDumps,
} from "../../src/main/crash-log";
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "axiom-crash-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const settle = () => new Promise((r) => setTimeout(r, 400));

it("summarises scalar arguments and counts arrays without copying large values", () => {
  expect(
    summariseArgs({
      method: "individualGrid",
      page: 2,
      exact: false,
      shown: ["a", "b", "c"],
      filter: { nested: true },
      text: "x".repeat(500),
    }),
  ).toBe(
    'method="individualGrid" page=2 exact=false shown=[3 items] text="' +
      "x".repeat(80) +
      '..."',
  );
  expect(
    summariseArgs({
      text: "y".repeat(80),
      more: "z".repeat(80),
      last: "w".repeat(80),
      end: "v".repeat(80),
    }).length,
  ).toBe(300);
  expect(summariseArgs(undefined)).toBe("");
});

it("keeps the last requests with duration and outcome, and marks those still running", () => {
  let changes = 0;
  const trail = new ActivityTrail(3, () => changes++);
  const first = trail.begin("state");
  first();
  trail.begin("find", { query: "nurse" })(Error("Search failed"));
  trail.begin("inspector", { iri: "a" })();
  trail.begin("individualGrid", { page: 2, scope: "School" });
  const list = trail.list();
  expect(list.map((e) => e.method)).toEqual([
    "find",
    "inspector",
    "individualGrid",
  ]);
  expect(list[0]).toMatchObject({
    outcome: "failed",
    error: "Search failed",
    args: 'query="nurse"',
  });
  expect(list[2].outcome).toBeUndefined();
  expect(changes).toBe(7);
  const events = activityEvents(list, Date.parse(list[2].startedAt) + 3400);
  expect(events[0].detail).toMatch(
    /^query="nurse", \d+ ms, failed: Search failed$/,
  );
  expect(events[2]).toMatchObject({
    stage: "individualGrid",
    detail: 'page=2 scope="School", still running after 3,400 ms',
  });
});

it("describes processes, memory, window and in-flight requests", () => {
  const trail = new ActivityTrail();
  trail.begin("individualGrid", { page: 977 });
  const details = crashDetails({
    activity: trail,
    metrics: [
      {
        pid: 10,
        type: "Browser",
        cpu: { percentCPUUsage: 12.345 },
        memory: {
          workingSetSize: 2048000,
          peakWorkingSetSize: 3072000,
          privateBytes: 1024000,
        },
      },
      { pid: 11, type: "Tab", name: "Axiom" },
    ],
    memory: {
      rss: 3 * 1048576 * 1000,
      heapUsed: 1048576 * 900,
      heapTotal: 1048576 * 1000,
      external: 1048576 * 5,
      arrayBuffers: 1048576 * 2,
    },
    heapLimit: 1048576 * 4096,
    system: { total: 64 * 1048576, free: 8 * 1048576 },
    window: {
      bounds: { x: 0, y: 0, width: 1920, height: 1040 },
      maximized: true,
      fullScreen: false,
      visible: true,
    },
    entities: 97692,
    storeVersion: 4,
  });
  expect(details["Requests in flight"]).toMatch(
    /individualGrid, page=977, still running after/,
  );
  expect(details["Axiom processes"]).toBe(
    "Browser pid 10: working set 2,000 MB, peak 3,000 MB, private 1,000 MB, CPU 12.3%\nTab (Axiom) pid 11: no memory figures",
  );
  expect(details["Main process memory"]).toBe(
    "rss 3,000 MB\nheap used 900 MB of 1,000 MB\nV8 heap limit 4,096 MB\nexternal 5 MB\narray buffers 2 MB",
  );
  expect(details["System memory"]).toBe("8,192 MB free of 65,536 MB");
  expect(details.Window).toBe(
    "1920 x 1040 at 0, 0, maximized, not full screen, visible",
  );
  expect(details.Workspace).toBe("97,692 entities, store version 4");
  expect(processTable([])).toBe("");
});

it("omits sections it has nothing for", () => {
  const trail = new ActivityTrail();
  trail.begin("state")();
  expect(crashDetails({ activity: trail })).toEqual({});
});

it("admits each distinct failure once and at most the session limit", () => {
  const gate = new FailureGate(2);
  const stack =
    "Error: boom\n    at render (app.js:1:2)\n    at other (app.js:3:4)";
  expect(gate.admit("boom", stack)).toBe(true);
  expect(gate.admit("boom", stack)).toBe(false);
  expect(gate.admit("boom", "Error: boom\n    at paint (app.js:9:9)")).toBe(
    true,
  );
  expect(gate.admit("another")).toBe(false);
});

it("reports a run that never closed, with its last activity", async () => {
  const crashed = new RunLog(root, () => ({
    workspace: "schools.ttl",
    processes: "Browser pid 1",
    activity: [
      {
        method: "individualGrid",
        args: "page=2",
        startedAt: new Date().toISOString(),
      },
    ],
  }));
  crashed.touch();
  await settle();
  const next = new RunLog(root, () => ({
    workspace: "",
    processes: "",
    activity: [],
  }));
  const previous = next.previous();
  expect(previous).toMatchObject({
    runId: crashed.runId,
    pid: process.pid,
    workspace: "schools.ttl",
    processes: "Browser pid 1",
    activity: [{ method: "individualGrid", args: "page=2" }],
  });
});

it("treats a closed run as normal even when an activity write lands after the close", async () => {
  const run = new RunLog(root, () => ({
    workspace: "",
    processes: "",
    activity: [],
  }));
  run.touch();
  run.close();
  run.touch();
  await settle();
  expect(await readFile(path.join(root, "crash-activity.closed"), "utf8")).toBe(
    run.runId,
  );
  expect(
    new RunLog(root, () => ({
      workspace: "",
      processes: "",
      activity: [],
    })).previous(),
  ).toBeUndefined();
});

it("reports nothing for a folder with no earlier run", () => {
  expect(
    new RunLog(root, () => ({
      workspace: "",
      processes: "",
      activity: [],
    })).previous(),
  ).toBeUndefined();
});

it("finds each new minidump once, oldest first", async () => {
  const folder = path.join(root, "Crashpad"),
    reported = path.join(root, "crash-dumps-reported.json");
  await mkdir(path.join(folder, "reports"), { recursive: true });
  await writeFile(path.join(folder, "reports", "b.dmp"), "12345");
  await writeFile(path.join(folder, "reports", "notes.txt"), "not a dump");
  await writeFile(path.join(folder, "settings.dat"), "");
  const first = await unreportedDumps(folder, reported);
  expect(first.dumps.map((d) => path.basename(d.file))).toEqual(["b.dmp"]);
  expect(first.dumps[0].size).toBe(5);
  expect(dumpList(first.dumps)).toContain(
    path.join(folder, "reports", "b.dmp"),
  );
  await first.remember();
  await writeFile(path.join(folder, "reports", "c.dmp"), "1");
  const second = await unreportedDumps(folder, reported);
  expect(second.dumps.map((d) => path.basename(d.file))).toEqual(["c.dmp"]);
  expect(
    (await unreportedDumps(path.join(root, "missing"), reported)).dumps,
  ).toEqual([]);
});

it("saves a crash record with its stack, details and earlier activity first in the timeline", async () => {
  const log = new AuditLog(path.join(root, "logs"));
  const stack = "Error: Renderer stopped\n    at crash (main.js:1:1)";
  const id = await log.record(
    "A window's renderer process stopped: oom, exit code -536870904.",
    "Renderer process stopped",
    { process: "renderer", reason: "oom", exitCode: -536870904 },
    {
      stack,
      events: [
        {
          time: "2026-10-29T20:00:00.000Z",
          stage: "individualGrid",
          detail: "page=2, still running after 3,400 ms",
        },
      ],
      details: { "Axiom processes": "Browser pid 10: working set 2,000 MB" },
    },
  );
  const record = await new AuditLog(path.join(root, "logs")).read(id);
  expect(record.message).toBe(
    "A window's renderer process stopped: oom, exit code -536870904.",
  );
  expect(record.metadata).toMatchObject({
    reason: "oom",
    exitCode: -536870904,
  });
  expect(record.events.map((e) => e.stage)).toEqual([
    "individualGrid",
    "Renderer process stopped",
  ]);
  expect(Object.keys(record.details)).toEqual([
    "Technical error",
    "Axiom processes",
  ]);
  expect(record.details["Technical error"]).toBe(stack);
});
