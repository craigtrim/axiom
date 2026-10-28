// #166: exercise fail-closed delivery with real files and controlled GitHub responses.
import test from "node:test";
import { createHash } from "node:crypto";
import { localDesktopCases } from "../../scripts/hybrid-test-policy.mjs";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  cp,
  rename,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  repository,
  workflowPath,
  readSource,
  latestSuccessfulRun,
  requireSuccessfulRun,
  candidateName,
} from "../../scripts/ci-build-gate.mjs";
import {
  inventory,
  verifyCandidate,
  promoteCandidate,
  contained,
} from "../../scripts/ci-artifact.mjs";
import { deliver } from "../../scripts/build-exe.mjs";
const source = { commit: "a".repeat(40), tree: "b".repeat(40) };
const good = {
  id: 42,
  workflow_id: 17,
  head_sha: source.commit,
  run_attempt: 1,
  path: workflowPath,
  head_repository: { full_name: repository },
  event: "pull_request",
  html_url: `https://github.com/${repository}/actions/runs/42`,
  status: "completed",
  conclusion: "success",
};
function apiFor(runs = [good], options = {}) {
  return async (endpoint) => {
    if (options.error) throw Error(options.error);
    if (endpoint === "user") return { login: "craigtrim" };
    if (endpoint.endsWith("workflows/build.yml"))
      return { id: 17, path: workflowPath, state: "active" };
    if (endpoint.includes("/runs?"))
      return { total_count: runs.length, workflow_runs: runs };
    if (endpoint.includes("/runs/"))
      return (
        options.current ??
        runs.find((run) => String(run.id) === endpoint.split("/").at(-1))
      );
    throw Error(`Unexpected API: ${endpoint}`);
  };
}
async function directory(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "axiom-ci-gate-"));
  t.after(async () => {
    assert.ok(
      path
        .resolve(dir)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + "axiom-ci-gate-"),
    );
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
async function candidate(t) {
  const dir = await directory(t);
  await mkdir(path.join(dir, "installer", "win-unpacked", "resources"), {
    recursive: true,
  });
  await writeFile(
    path.join(dir, "installer", "win-unpacked", "Axiom.exe"),
    "tested application bytes",
  );
  await writeFile(
    path.join(dir, "installer", "win-unpacked", "resources", "app.asar"),
    "tested application archive",
  );
  await writeFile(
    path.join(dir, "installer", "Axiom-Setup-1.0.0.exe"),
    "tested installer bytes",
  );
  const files = await inventory(path.join(dir, "installer"));
  const receipt = {
    schema: 1,
    repository,
    workflowPath,
    source: { ...source, checkoutCommit: "c".repeat(40) },
    run: { id: good.id, attempt: good.run_attempt, url: good.html_url },
    packagedDesktopChecksPassed: 8,
    semanticChecksIncluded: true,
    verification: {
      checkedBuildFiles: 5,
      checkedRuntimeFiles: 3,
      executableSha256: files["win-unpacked/Axiom.exe"].sha256,
      installerSha256: files["Axiom-Setup-1.0.0.exe"].sha256,
    },
    package: {
      version: "1.0.0",
      directory: "win-unpacked",
      executable: "win-unpacked/Axiom.exe",
      installer: "Axiom-Setup-1.0.0.exe",
      signed: false,
    },
    files,
  };
  await writeFile(path.join(dir, "candidate.json"), JSON.stringify(receipt));
  return { dir, receipt };
}
async function previousDelivery(t) {
  const root = await directory(t);
  await mkdir(path.join(root, "artifacts", "installer", "win-unpacked"), {
    recursive: true,
  });
  await mkdir(path.join(root, "artifacts", "build-exe"), { recursive: true });
  await writeFile(
    path.join(root, "artifacts", "installer", "win-unpacked", "Axiom.exe"),
    "previous verified executable",
  );
  await writeFile(
    path.join(root, "artifacts", "latest-electron.json"),
    "previous metadata",
  );
  await writeFile(
    path.join(root, "artifacts", "build-exe", "receipt.json"),
    "previous receipt",
  );
  return root;
}
async function assertPrevious(root) {
  assert.equal(
    await readFile(
      path.join(root, "artifacts", "installer", "win-unpacked", "Axiom.exe"),
      "utf8",
    ),
    "previous verified executable",
  );
  assert.equal(
    await readFile(
      path.join(root, "artifacts", "latest-electron.json"),
      "utf8",
    ),
    "previous metadata",
  );
  assert.equal(
    await readFile(
      path.join(root, "artifacts", "build-exe", "receipt.json"),
      "utf8",
    ),
    "previous receipt",
  );
}
function runner(options = {}) {
  let sourceReads = 0,
    queries = 0,
    downloads = 0;
  const run = async (file, args, root) => {
    if (file === "git") {
      if (options.nonGit) throw Error("not a repository");
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        sourceReads++;
        return options.changedSource && sourceReads > 1
          ? "d".repeat(40)
          : source.commit;
      }
      if (args[0] === "rev-parse") return source.tree;
      if (args[0] === "remote")
        return options.remote ?? `https://github.com/${repository}.git`;
      if (args[0] === "status") return options.dirty ?? "";
    }
    if (file === "gh" && args[0] === "api") {
      if (args[1] === "user") queries++;
      const runs =
        queries > 1 && options.finalRuns
          ? options.finalRuns
          : (options.runs ?? [good]);
      return JSON.stringify(
        await apiFor(runs, { error: options.apiError })(args[1]),
      );
    }
    if (file === "gh" && args[0] === "run" && args[1] === "download") {
      downloads++;
      assert.equal(args[args.indexOf("--name") + 1], candidateName(good));
      if (options.downloadError) throw Error(options.downloadError);
      assert.ok(options.candidate);
      await cp(options.candidate, args[args.indexOf("--dir") + 1], {
        recursive: true,
      });
      return "";
    }
    if (
      file === process.execPath &&
      args[0] === "scripts/test-local-desktop.mjs"
    ) {
      if (options.localFailure) throw Error("Local desktop test failed");
      const output = path.join(root, "artifacts/local-desktop");
      await mkdir(output, { recursive: true });
      if (options.localMissing) return "";
      const specs = localDesktopCases.map(({ file, title }) => ({
        file,
        title,
        tests: [
          {
            expectedStatus: "passed",
            status: "expected",
            results: [{ status: "passed" }],
          },
        ],
      }));
      if (options.localMissingCase) specs.pop();
      if (options.localDuplicateCase) specs.push(specs[0]);
      if (options.localFailedCase)
        specs[0].tests[0].results[0].status = "failed";
      if (options.localSkippedCase)
        specs[0].tests[0].results[0].status = "skipped";
      if (options.localRetry)
        specs[0].tests[0].results.unshift({ status: "failed" });
      const bytes = JSON.stringify({ suites: [{ specs }] });
      const proof = {
        schema: 1,
        validationId: options.localStaleToken ? "old-validation" : args[2],
        source: {
          commit: options.localWrongCommit ? "d".repeat(40) : source.commit,
          tree: options.localWrongTree ? "d".repeat(40) : source.tree,
        },
        listed: localDesktopCases.length,
        passed: localDesktopCases.length,
        skipped: [],
        completedAt: new Date().toISOString(),
        resultsSha256: createHash("sha256").update(bytes).digest("hex"),
      };
      await writeFile(
        path.join(output, "results.json"),
        bytes + (options.localAlteredReport ? " " : ""),
      );
      await writeFile(path.join(output, "receipt.json"), JSON.stringify(proof));
      return "Local desktop validation passed";
    }
    throw Error(`Unexpected command: ${file} ${args.join(" ")}`);
  };
  return { run, downloads: () => downloads };
}
test("accepts the current successful attempt and reads fresh run details", async () => {
  const result = await latestSuccessfulRun(
    source,
    apiFor([good], { current: { ...good, run_attempt: 2 } }),
  );
  assert.equal(result.run_attempt, 2);
});
test("a newer failure overrides an older success regardless of response order", async () => {
  const newer = {
    ...good,
    id: 43,
    html_url: good.html_url.replace("42", "43"),
    conclusion: "failure",
  };
  await assert.rejects(
    latestSuccessfulRun(source, apiFor([good, newer])),
    /43/,
  );
});
for (const [label, change] of Object.entries({
  failure: { conclusion: "failure" },
  cancelled: { conclusion: "cancelled" },
  timedOut: { conclusion: "timed_out" },
  pending: { status: "queued", conclusion: null },
  running: { status: "in_progress", conclusion: null },
  skipped: { conclusion: "skipped" },
  wrongRevision: { head_sha: "d".repeat(40) },
  wrongWorkflow: { workflow_id: 19 },
  wrongPath: { path: "other.yml" },
  fork: { head_repository: { full_name: "other/axiom" } },
}))
  test(`rejects ${label} and preserves the existing delivery`, async (t) => {
    const root = await previousDelivery(t);
    const commands = runner({ runs: [{ ...good, ...change }] });
    await assert.rejects(deliver(root, commands.run));
    assert.equal(commands.downloads(), 0);
    await assertPrevious(root);
  });
for (const [label, options] of Object.entries({
  missing: { runs: [] },
  authentication: { apiError: "401 authentication required" },
  offline: { apiError: "network unavailable" },
  dirty: { dirty: " M src/main/main.ts" },
  untracked: { dirty: "?? src/new.ts" },
  archive: { nonGit: true },
  wrongRemote: { remote: "https://github.com/other/axiom.git" },
}))
  test(`rejects ${label} before download or replacement`, async (t) => {
    const root = await previousDelivery(t);
    const commands = runner(options);
    await assert.rejects(deliver(root, commands.run));
    assert.equal(commands.downloads(), 0);
    await assertPrevious(root);
  });
test("a source archive fails a real Git lookup", async (t) => {
  await assert.rejects(readSource(await directory(t)), /Git checkout/);
});
test("successful rerun uses its current attempt", async () => {
  assert.equal(
    candidateName(
      requireSuccessfulRun({ ...good, run_attempt: 3 }, source, 17),
    ),
    "axiom-candidate-3",
  );
});
test("validates a PR candidate with the exact local tree", async (t) => {
  const fixture = await candidate(t);
  assert.equal(
    (await verifyCandidate(fixture.dir, source, good)).source.checkoutCommit,
    "c".repeat(40),
  );
});
for (const [label, change] of Object.entries({
  candidateRevision: (receipt) => {
    receipt.source.commit = "d".repeat(40);
  },
  mergeTree: (receipt) => {
    receipt.source.tree = "d".repeat(40);
  },
  staleAttempt: (receipt) => {
    receipt.run.attempt = 2;
  },
  missingPackagedChecks: (receipt) => {
    receipt.packagedDesktopChecksPassed = 6;
  },
  missingSemanticChecks: (receipt) => {
    receipt.semanticChecksIncluded = false;
  },
  invalidPath: (receipt) => {
    receipt.package.installer = "../Axiom.exe";
  },
  traversal: (receipt) => {
    receipt.files["../outside.exe"] = receipt.files["win-unpacked/Axiom.exe"];
  },
}))
  test(`rejects artifact ${label}`, async (t) => {
    const fixture = await candidate(t);
    change(fixture.receipt);
    await writeFile(
      path.join(fixture.dir, "candidate.json"),
      JSON.stringify(fixture.receipt),
    );
    await assert.rejects(verifyCandidate(fixture.dir, source, good));
  });
for (const mode of ["tampered", "missing", "extra"])
  test(`rejects ${mode} artifact bytes and preserves the previous EXE`, async (t) => {
    const fixture = await candidate(t);
    const root = await previousDelivery(t);
    const executable = path.join(
      fixture.dir,
      "installer",
      "win-unpacked",
      "Axiom.exe",
    );
    if (mode === "tampered")
      await writeFile(executable, "unverified application bytes");
    if (mode === "missing") await rm(executable);
    if (mode === "extra")
      await writeFile(
        path.join(fixture.dir, "installer", "extra.dll"),
        "extra",
      );
    await assert.rejects(deliver(root, runner({ candidate: fixture.dir }).run));
    await assertPrevious(root);
  });
test("a missing or expired artifact preserves the previous EXE", async (t) => {
  const root = await previousDelivery(t);
  await assert.rejects(
    deliver(root, runner({ downloadError: "artifact not found" }).run),
    /artifact not found/,
  );
  await assertPrevious(root);
});
for (const [label, options] of Object.entries({
  newAttempt: { finalRuns: [{ ...good, run_attempt: 2 }] },
  newFailure: { finalRuns: [{ ...good, conclusion: "failure" }] },
  changedSource: { changedSource: true },
}))
  test(`rechecks ${label} after download and preserves the previous EXE`, async (t) => {
    const fixture = await candidate(t);
    const root = await previousDelivery(t);
    await assert.rejects(
      deliver(root, runner({ candidate: fixture.dir, ...options }).run),
    );
    await assertPrevious(root);
  });
test("delivers verified bytes and records source, workflow URL, attempt and conclusion", async (t) => {
  const fixture = await candidate(t);
  const root = await previousDelivery(t);
  const result = await deliver(root, runner({ candidate: fixture.dir }).run);
  assert.equal(
    await readFile(result.executable, "utf8"),
    "tested application bytes",
  );
  const receipt = JSON.parse(await readFile(result.receipt, "utf8"));
  assert.deepEqual(receipt.source, fixture.receipt.source);
  assert.deepEqual(receipt.run, {
    ...fixture.receipt.run,
    status: "completed",
    conclusion: "success",
  });
  assert.equal(receipt.packagedDesktopChecksPassed, 8);
  assert.equal(receipt.localDesktopValidation.passed, localDesktopCases.length);
  assert.deepEqual(receipt.localDesktopValidation.source, source);
  assert.match(receipt.localDesktopValidation.resultsSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.package.executable, result.executable);
});
test("a promotion failure restores the previous executable and metadata", async (t) => {
  const fixture = await candidate(t);
  const root = await previousDelivery(t);
  let failed = false;
  const move = async (from, to) => {
    if (!failed && from.includes("latest-electron.json.next-")) {
      failed = true;
      throw Error("simulated locked metadata");
    }
    await rename(from, to);
  };
  await assert.rejects(
    promoteCandidate(fixture.dir, root, fixture.receipt, good, move),
    /restored/,
  );
  await assertPrevious(root);
});
test("rejects absolute, traversal, Windows stream and separator paths", () => {
  for (const name of [
    "../escape",
    "/absolute",
    "C:/escape",
    "file:stream",
    "a\\b",
    "a/../b",
    "a//b",
    "a. ",
  ])
    assert.throws(() => contained(os.tmpdir(), name));
});

test("missing executable and missing hash cannot count as verified", async (t) => {
  const fixture = await candidate(t);
  delete fixture.receipt.verification.executableSha256;
  delete fixture.receipt.files["win-unpacked/Axiom.exe"];
  await rm(path.join(fixture.dir, "installer", "win-unpacked", "Axiom.exe"));
  await writeFile(
    path.join(fixture.dir, "candidate.json"),
    JSON.stringify(fixture.receipt),
  );
  await assert.rejects(verifyCandidate(fixture.dir, source, good));
});
test("a concurrent delivery lock preserves the existing executable", async (t) => {
  const root = await previousDelivery(t);
  await writeFile(
    path.join(root, "artifacts", "build-exe", "delivery.lock"),
    "other process",
  );
  const commands = runner();
  await assert.rejects(deliver(root, commands.run), /delivery may be active/);
  assert.equal(commands.downloads(), 0);
  await assertPrevious(root);
});
test("paginates complete history before choosing the newest run", async () => {
  const runs = Array.from({ length: 101 }, (_, i) => ({
    ...good,
    id: i + 1,
    html_url: good.html_url.replace("42", String(i + 1)),
    conclusion: i === 100 ? "failure" : "success",
  }));
  const base = apiFor(runs);
  const api = async (endpoint) =>
    endpoint.includes("/runs?")
      ? {
          total_count: 101,
          workflow_runs: endpoint.endsWith("page=1")
            ? runs.slice(0, 100)
            : runs.slice(100),
        }
      : base(endpoint);
  await assert.rejects(latestSuccessfulRun(source, api), /runs\/101/);
});
test("incomplete history fails closed", async () => {
  const base = apiFor();
  const api = async (endpoint) =>
    endpoint.includes("/runs?")
      ? { total_count: 5, workflow_runs: [] }
      : base(endpoint);
  await assert.rejects(
    latestSuccessfulRun(source, api),
    /Incomplete workflow history/,
  );
});

for (const failure of [
  "localFailure",
  "localMissing",
  "localStaleToken",
  "localWrongCommit",
  "localWrongTree",
  "localMissingCase",
  "localDuplicateCase",
  "localFailedCase",
  "localSkippedCase",
  "localRetry",
  "localAlteredReport",
]) {
  test(
    "rejects " + failure + " and preserves the existing EXE despite passing CI",
    async (t) => {
      const root = await previousDelivery(t);
      const proposed = await candidate(t);
      const simulated = runner({ candidate: proposed.dir, [failure]: true });
      await assert.rejects(deliver(root, simulated.run));
      assert.equal(simulated.downloads(), 1);
      await assertPrevious(root);
    },
  );
}
