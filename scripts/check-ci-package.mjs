// #166: packaged application validation runs only on GitHub-hosted Windows.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
let logDirectory;

async function runStep(name, args, env = process.env) {
  console.log(`\n${name}...`);
  const logPath = path.join(
    logDirectory,
    name.toLowerCase().replaceAll(" ", "-") + ".log",
  );
  const log = await open(logPath, "w");
  const started = Date.now();
  const progress = setInterval(
    () =>
      console.log(
        `  Still running (${Math.round((Date.now() - started) / 1000)}s). Log: ${logPath}`,
      ),
    30000,
  );
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: root,
        env,
        stdio: ["ignore", log.fd, log.fd],
        windowsHide: true,
        shell: false,
      });
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        code === 0
          ? resolve()
          : reject(
              Error(`${name} failed (${signal ?? code}). Read ${logPath}`),
            ),
      );
    });
    console.log(`  Passed (${Math.round((Date.now() - started) / 1000)}s).`);
  } finally {
    clearInterval(progress);
    await log.close();
  }
}

const digest = (data) => createHash("sha256").update(data).digest("hex");
async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest("hex");
}

async function verifyPackage(metadata) {
  const { extractFile } = await import("@electron/asar");
  const archive = path.join(metadata.directory, "resources", "app.asar");
  let buildFiles = 0;
  async function visit(relative) {
    for (const entry of await readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (!file.endsWith(".map")) {
        if (
          (await fileDigest(path.join(root, file))) !==
          digest(extractFile(archive, file))
        )
          throw Error(`Packaged file differs from the build: ${file}`);
        buildFiles++;
      }
    }
  }
  await visit("dist");
  const runtime = path.join(metadata.directory, "resources", "mutatoc");
  const manifest = JSON.parse(
    await readFile(path.join(runtime, "package-manifest.json"), "utf8"),
  );
  for (const [file, expected] of Object.entries(manifest.files)) {
    const content = await readFile(path.join(runtime, file));
    if (
      content.length !== expected.bytes ||
      digest(content) !== expected.sha256
    )
      throw Error(`Packaged runtime checksum mismatch: ${file}`);
  }
  for (const file of ["THIRD-PARTY-NOTICES.txt", "LICENSES.md"])
    if (
      (await fileDigest(path.join(root, "licenses", file))) !==
      (await fileDigest(path.join(metadata.directory, "resources", file)))
    )
      throw Error(`Packaged license differs from the source: ${file}`);
  return {
    checkedBuildFiles: buildFiles,
    runtimeVersion: manifest.version,
    checkedRuntimeFiles: Object.keys(manifest.files).length,
    executableSha256: await fileDigest(metadata.executable),
    installerSha256: await fileDigest(metadata.installer),
  };
}

import { inventory } from "./ci-artifact.mjs";
import { repository, workflowPath, candidateName } from "./ci-build-gate.mjs";
import { verifyNativeCoverage } from "./native-test-coverage.ts";
async function main() {
  if (
    process.platform !== "win32" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_ENVIRONMENT !== "github-hosted"
  )
    throw Error(
      "Packaged UI checks require a GitHub-hosted Windows runner. Use build:exe for local delivery.",
    );
  if (
    process.env.GITHUB_REPOSITORY !== repository ||
    process.env.AXIOM_TEST_QUIET
  )
    throw Error(
      "Unexpected repository or quiet-mode environment for packaged checks.",
    );
  process.chdir(root);
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const commit = event.pull_request?.head.sha ?? process.env.GITHUB_SHA;
  if (
    event.pull_request &&
    event.pull_request.head.repo.full_name !== repository
  )
    throw Error("A fork cannot produce a delivery candidate.");
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  const checkoutCommit = git(["rev-parse", "HEAD"]);
  if (
    checkoutCommit !== process.env.GITHUB_SHA ||
    !/^[a-f0-9]{40}$/.test(commit)
  )
    throw Error("CI checkout identity is invalid.");
  const source = {
    commit,
    checkoutCommit,
    tree: git(["rev-parse", "HEAD^{tree}"]),
  };
  const run = {
    id: Number(process.env.GITHUB_RUN_ID),
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    url: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  };
  if (
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.attempt) ||
    run.attempt < 1
  )
    throw Error("CI run identity is invalid.");
  logDirectory = path.join(root, "artifacts", "packaged");
  await mkdir(logDirectory, { recursive: true });
  const metadata = JSON.parse(
    await readFile("artifacts/latest-electron.json", "utf8"),
  );
  const modelDirectory = process.env.AXIOM_EMBEDDING_MODEL_DIR;
  if (
    !modelDirectory ||
    !["axiom-model.json", "onnx/model.onnx"].every((file) =>
      existsSync(path.join(modelDirectory, file)),
    )
  )
    throw Error(
      "The real MPNet model is required for all eight packaged checks.",
    );
  const titles = [
    "Find records a colon title as one synonym literal",
    "#128 plain highlight clicks keep the caret and focus with Auto on",
    "#128 plain highlight clicks keep the caret and focus with Auto off",
    "a label delta refreshes Hierarchy, Find, Individuals and Details",
    "Find and resource inputs keep lexical results when the local model is absent",
    "periodic autosave retains ontology, all graph settings, cameras and panes after a forced exit",
    "MPNet Find recognizes synonyms without spelling overlap and opens the same results in a graph",
    "automatic Find enriches an unseen query and preserves field and type facets",
  ];
  const testEnv = {
    ...process.env,
    AXIOM_TEST_EXE: metadata.executable,
    AXIOM_TEST_BACKGROUND: "1",
    PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(logDirectory, "inventory.json"),
  };
  delete testEnv.AXIOM_MUTATOC_HOME;
  const args = [
    require.resolve("@playwright/test/cli"),
    "test",
    "--config",
    "config/playwright.config.ts",
    "tests/e2e/find.spec.ts",
    "tests/e2e/text-analysis.spec.ts",
    "tests/e2e/state-updates.spec.ts",
    "tests/e2e/workspace-autosave.spec.ts",
    "--grep",
    "(?:" +
      titles
        .map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|") +
      ")$",
    "--forbid-only",
    "--retries=0",
    "--max-failures=0",
  ];
  await runStep(
    "List packaged checks",
    [...args, "--list", "--reporter=json"],
    testEnv,
  );
  testEnv.PLAYWRIGHT_JSON_OUTPUT_FILE = path.join(logDirectory, "results.json");
  await runStep(
    "Check packaged application",
    [
      ...args,
      "--reporter=list,json",
      "--output",
      path.join(logDirectory, "traces"),
    ],
    testEnv,
  );
  const coverage = verifyNativeCoverage(
    JSON.parse(
      await readFile(path.join(logDirectory, "inventory.json"), "utf8"),
    ),
    JSON.parse(await readFile(path.join(logDirectory, "results.json"), "utf8")),
  );
  if (coverage.listed !== 8 || coverage.passed !== 8 || coverage.skipped.length)
    throw Error(
      "All eight packaged checks must pass once without skips or retries.",
    );
  const verification = await verifyPackage(metadata);
  const installerRoot = path.join(root, "artifacts", "installer");
  const relative = (file) => {
    const value = path.relative(installerRoot, file).split(path.sep).join("/");
    if (value.startsWith("..") || path.isAbsolute(value))
      throw Error("Package path escapes installer directory.");
    return value;
  };
  const candidate = {
    schema: 1,
    repository,
    workflowPath,
    source,
    run,
    packagedDesktopChecksPassed: 8,
    semanticChecksIncluded: true,
    verification,
    package: {
      ...metadata,
      directory: relative(metadata.directory),
      executable: relative(metadata.executable),
      installer: relative(metadata.installer),
    },
    files: await inventory(installerRoot),
  };
  await writeFile(
    path.join(root, "artifacts", "candidate.json"),
    JSON.stringify(candidate, null, 2) + "\n",
  );
  console.log(
    `CANDIDATE VERIFIED: ${candidateName({ run_attempt: run.attempt })}, 8 packaged checks, ${Object.keys(candidate.files).length} file checksums.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
