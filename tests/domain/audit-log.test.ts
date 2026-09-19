import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AuditLog,
  auditDetail,
  auditId,
  auditStep,
} from "../../src/main/audit-log";
import { LocalAssistantRunner } from "../../src/main/local-assistant";
import { TaxonomyAssistantService } from "../../src/main/taxonomy-assistant-service";
import { buildEmptyStore } from "../../src/domain/workspace";
import { taxonomyContext } from "../../src/domain/taxonomy-assistant";
import { THING } from "../../src/domain/model";
import { cleanErrorMessage, auditReport } from "../../src/shared/audit";
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "axiom-audit-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it.each(["claude", "codex"] as const)(
  "retains %s raw output when taxonomy parsing fails, including after restart",
  async (provider) => {
    const script = path.join(root, "fake.cjs");
    const reply =
      "Summary: Proposed child.\nSuggestions:\n1. Ethics course\nDescription: A course about ethics.";
    await writeFile(
      script,
      'const fs=require("node:fs");process.stdin.resume();process.stdin.on("end",()=>{' +
        'process.stderr.write("fixture warning");' +
        (provider === "claude"
          ? "process.stdout.write(JSON.stringify({result:" +
            JSON.stringify(reply) +
            "}));"
          : 'fs.writeFileSync(process.argv[process.argv.indexOf("--output-last-message")+1],' +
            JSON.stringify(reply) +
            ");") +
        "});",
    );
    const store = buildEmptyStore();
    const service = new TaxonomyAssistantService(
      path.join(root, "runs"),
      async (input) => taxonomyContext(store, input.iri, input.mode, 1),
      async () => [],
      async () => [],
      async () => [{ id: provider, file: process.execPath, args: [script] }],
    );
    const audit = new AuditLog(path.join(root, "logs"));
    await expect(
      audit.run("Add children", { provider }, () =>
        service.run({
          provider,
          id: "run",
          iri: THING,
          mode: "children",
          datasetEpoch: 1,
          version: store.version,
        }),
      ),
    ).rejects.toThrow(/missing Reason/);
    const summary = (await audit.list())[0];
    expect(summary.stage).toBe("Parsing taxonomy proposal");
    const saved = await new AuditLog(path.join(root, "logs")).read(summary.id);
    expect(saved.details["Assistant response"]).toBe(reply);
    expect(saved.details["Process stderr (last 8,000 characters)"]).toBe(
      "fixture warning",
    );
    expect(saved.details.Prompt).toContain("Suggest useful additional types");
    expect(saved.metadata.exitCode).toBe(0);
    expect(saved.events.map((e) => e.stage)).toContain("Starting assistant");
    expect((await service.read("run")).entry.auditId).toBe(summary.id);
    expect(await readdir(path.join(root, "runs"))).toEqual(["history"]);
    expect(auditReport(saved)).toContain(reply);
  },
);

it("records nonzero exit codes and stderr even when no response file exists", async () => {
  const script = path.join(root, "fail.cjs");
  await writeFile(
    script,
    'process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write("partial response");process.stderr.write("authentication failed");process.exitCode=7;});',
  );
  const runner = new LocalAssistantRunner(path.join(root, "runs"), async () => [
    { id: "codex", file: process.execPath, args: [script] },
  ]);
  const audit = new AuditLog(path.join(root, "logs"));
  await expect(
    audit.run("Research", {}, () => runner.run("codex", "prompt", null)),
  ).rejects.toThrow(/code 7/);
  const saved = await audit.read((await audit.list())[0].id);
  expect(saved.metadata.exitCode).toBe(7);
  expect(saved.details["Process stdout"]).toBe("partial response");
  expect(saved.details["Process stderr (last 8,000 characters)"]).toBe(
    "authentication failed",
  );
});

it("isolates overlapping operations and preserves only failed operations", async () => {
  const audit = new AuditLog(path.join(root, "logs"));
  await Promise.all(
    ["First", "Second"].map((name) =>
      audit
        .run(name, {}, async () => {
          auditDetail("response", name);
          await new Promise((resolve) => setTimeout(resolve, 5));
          auditStep(name + " parse");
          throw Error(name + " error");
        })
        .catch(() => {}),
    ),
  );
  await audit.run("Success", {}, () => 42);
  const records = await audit.list();
  expect(records).toHaveLength(2);
  for (const item of records)
    expect((await audit.read(item.id)).details.response).toBe(item.operation);
  expect(auditId()).toBeUndefined();
});

it("redacts recognized credentials in files, summaries and copied reports, and marks truncated output", async () => {
  const audit = new AuditLog(path.join(root, "logs"));
  const token = "sk-ant-" + "a".repeat(30);
  await audit
    .run("Request", { credential: token }, () => {
      auditDetail(
        "response",
        'Authorization: Bearer secret-bearer-value\napi_key="secret-key-value"\n' +
          token,
      );
      auditDetail("large", "x".repeat(300000));
      throw Error("password=secret-password-value");
    })
    .catch(() => {});
  const summary = (await audit.list())[0],
    record = await audit.read(summary.id);
  const stored = await readFile(record.file!, "utf8");
  for (const value of [
    token,
    "secret-bearer-value",
    "secret-key-value",
    "secret-password-value",
  ]) {
    expect(stored).not.toContain(value);
    expect(JSON.stringify(summary)).not.toContain(value);
    expect(auditReport(record)).not.toContain(value);
  }
  expect(stored).toContain("[redacted]");
  expect(record.details.large).toContain("Truncated");
});

it("retains readable diagnostics if disk writes fail and rejects arbitrary file paths", async () => {
  const blocked = path.join(root, "file");
  await writeFile(blocked, "not a directory");
  const audit = new AuditLog(blocked);
  await audit
    .run("Read", {}, () => {
      throw Error("original failure");
    })
    .catch(() => {});
  const record = await audit.read((await audit.list())[0].id);
  expect(record.message).toBe("original failure");
  expect(record.storageError).toContain("Could not save");
  expect(record.file).toBeUndefined();
  await expect(audit.read("../secret")).rejects.toThrow(/Invalid/);
});

it("removes Electron transport wrappers from user-facing errors", () => {
  expect(
    cleanErrorMessage(
      Error(
        "Error invoking remote method 'taxonomyAssistant:run': Error: Missing description.",
      ),
    ),
  ).toBe("Missing description.");
});
