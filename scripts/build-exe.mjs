// Local Windows delivery: build, exercise the packaged app, and verify its files.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
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

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "Build and verify Axiom for Windows.\n\n" +
        "Run Build-Axiom-EXE.ps1 in PowerShell, or npm run build:exe.\n" +
        "Requires Node.js 22.12+, npm ci, and the Mutatoc runtime.\n" +
        "Uses this checkout; writes the app and installer to artifacts/installer.\n" +
        "Runs type checking, packaged desktop checks, and file verification.\n" +
        "Logs and a checksum receipt go under artifacts/build-exe.\n" +
        "Does not publish a release or install the application.",
    );
    return;
  }
  if (args.length)
    throw Error("Unknown argument. Use --help for instructions.");
  if (process.platform !== "win32")
    throw Error(
      "This helper builds the Windows application. Run it on Windows.",
    );
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw Error("Install Node.js 22.12 or later, then try again.");
  process.chdir(root);
  for (const dependency of [
    "typescript/bin/tsc",
    "esbuild",
    "electron-builder",
    "@electron/asar",
    "@playwright/test/cli",
  ]) {
    try {
      require.resolve(dependency);
    } catch {
      throw Error(
        `Dependencies are missing. Run npm ci in ${root}, then retry.`,
      );
    }
  }
  const startedAt = new Date().toISOString();
  logDirectory = path.join(
    root,
    "artifacts",
    "build-exe",
    startedAt.replaceAll(":", "-"),
  );
  await mkdir(logDirectory, { recursive: true });
  console.log(`Building Axiom from ${root}`);
  console.log(`Logs: ${logDirectory}`);
  console.log(
    "Close the copy running from artifacts\\installer\\win-unpacked before building.",
  );

  await runStep("Check native runtime", ["scripts/setup-mutatoc.mjs"]);
  await runStep("Check TypeScript", [
    require.resolve("typescript/bin/tsc"),
    "--noEmit",
  ]);
  await runStep("Build application", ["scripts/build.mjs"]);
  await runStep("Package Windows application", ["scripts/package.mjs"], {
    ...process.env,
    AXIOM_LOCAL_BUILD: "1",
  });
  const metadata = JSON.parse(
    await readFile("artifacts/latest-electron.json", "utf8"),
  );
  const modelDirectory = path.resolve(
    process.env.AXIOM_EMBEDDING_MODEL_DIR ||
      path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"),
        "Axiom",
        "models",
        "all-mpnet-base-v2-fp32",
      ),
  );
  const hasModel = ["axiom-model.json", "onnx/model.onnx"].every((file) =>
    existsSync(path.join(modelDirectory, file)),
  );
  const checks = [
    "Find records a colon",
    "#128 plain highlight",
    "a label delta",
    "local model is absent",
    "periodic autosave retains",
  ];
  if (hasModel) checks.push("MPNet Find recognizes", "automatic Find enriches");
  else
    console.log(
      "\nLocal MPNet model not installed: running six checks; the two semantic-search checks are omitted.",
    );
  const testEnv = {
    ...process.env,
    AXIOM_TEST_EXE: metadata.executable,
    AXIOM_TEST_BACKGROUND: "1",
    AXIOM_EMBEDDING_MODEL_DIR: modelDirectory,
    PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(
      logDirectory,
      "desktop-results.json",
    ),
  };
  delete testEnv.AXIOM_MUTATOC_HOME;
  await runStep(
    "Check packaged application",
    [
      require.resolve("@playwright/test/cli"),
      "test",
      "--config",
      "config/playwright.config.ts",
      "tests/e2e/find.spec.ts",
      "tests/e2e/text-analysis.spec.ts",
      "tests/e2e/state-updates.spec.ts",
      "tests/e2e/workspace-autosave.spec.ts",
      "--grep",
      checks.join("|"),
      "--reporter=list,json",
      "--output",
      path.join(logDirectory, "desktop"),
    ],
    testEnv,
  );
  const { stats } = JSON.parse(
    await readFile(testEnv.PLAYWRIGHT_JSON_OUTPUT_FILE, "utf8"),
  );
  const expectedChecks = hasModel ? 8 : 6;
  if (
    stats.expected !== expectedChecks ||
    stats.unexpected ||
    stats.skipped ||
    stats.flaky
  )
    throw Error(
      `Expected ${expectedChecks} passing desktop checks. Read the test log.`,
    );

  console.log("\nVerify packaged files...");
  const verification = await verifyPackage(metadata);
  let source = null;
  try {
    const git = (args) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    source = {
      commit: git(["rev-parse", "HEAD"]),
      workingTree: git(["status", "--short"]),
    };
  } catch {
    // A source archive without Git is also a valid local build.
  }
  const receipt = path.join(logDirectory, "receipt.json");
  await writeFile(
    receipt,
    JSON.stringify(
      {
        ...metadata,
        startedAt,
        verifiedAt: new Date().toISOString(),
        source,
        packagedDesktopChecksPassed: stats.expected,
        semanticChecksIncluded: hasModel,
        ...verification,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `  Passed: ${verification.checkedBuildFiles} build files and ${verification.checkedRuntimeFiles} runtime files.`,
  );
  console.log(
    `\nBUILD VERIFIED: ${stats.expected} packaged desktop checks passed.\n\n` +
      `Run directly:\n${metadata.executable}\n\n` +
      `Installer:\n${metadata.installer}\n\n` +
      `Receipt:\n${receipt}`,
  );
}

main().catch((error) => {
  console.error(`\nBUILD FAILED: ${error.message}`);
  if (logDirectory) console.error(`Logs: ${logDirectory}`);
  process.exitCode = 1;
});
