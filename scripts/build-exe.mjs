// #166: local EXE delivery downloads the exact CI-tested artifact without opening windows.
import { open, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  command,
  repository,
  readSource,
  latestSuccessfulRun,
  sameEvidence,
  candidateName,
} from "./ci-build-gate.mjs";
import {
  safeDirectory,
  verifyCandidate,
  promoteCandidate,
} from "./ci-artifact.mjs";
export async function deliver(root, runCommand = command) {
  const api = async (endpoint) => {
    try {
      return JSON.parse(await runCommand("gh", ["api", endpoint], root));
    } catch (error) {
      throw Error(`GitHub API/authentication is unavailable: ${error.message}`);
    }
  };
  const source = await readSource(root, runCommand);
  console.log(`Checking CI for ${source.commit}...`);
  const run = await latestSuccessfulRun(source, api);
  console.log(`Verified CI: ${run.html_url} (attempt ${run.run_attempt})`);
  const artifacts = path.join(root, "artifacts");
  await safeDirectory(artifacts);
  const output = path.join(artifacts, "build-exe");
  await safeDirectory(output);
  const lockPath = path.join(output, "delivery.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw Error(`Another delivery may be active. Lock: ${lockPath}`);
  }
  let stage;
  try {
    await lock.writeFile(String(process.pid));
    stage = await mkdtemp(path.join(output, "download-"));
    console.log("Downloading the packaged application tested by CI...");
    await runCommand(
      "gh",
      [
        "run",
        "download",
        String(run.id),
        "--repo",
        repository,
        "--name",
        candidateName(run),
        "--dir",
        stage,
      ],
      root,
    );
    const candidate = await verifyCandidate(stage, source, run);
    const current = await latestSuccessfulRun(source, api);
    sameEvidence(run, current);
    const currentSource = await readSource(root, runCommand);
    if (
      currentSource.commit !== source.commit ||
      currentSource.tree !== source.tree
    )
      throw Error(
        "Source changed during download. Retry from the intended clean revision.",
      );
    return await promoteCandidate(stage, root, candidate, current);
  } catch (error) {
    throw Error(
      `${error.message}\nRevision: ${source.commit}\nCI: ${run.html_url}`,
    );
  } finally {
    if (stage)
      await rm(stage, { recursive: true, force: true }).catch(() => {});
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "Deliver the Windows executable tested by GitHub CI.\nRequires Node.js 22.12+, Git, authenticated gh, and a clean craigtrim/axiom checkout.\nThe latest Electron desktop run for HEAD must succeed with a verified candidate artifact.\nNo application windows open locally. Outputs: artifacts/installer; receipt: artifacts/build-exe/receipt.json.\nSee docs/development/ci-delivery.md for failures, retries and notification settings.",
    );
    return;
  }
  if (args.length)
    throw Error("Unknown argument. Use --help for instructions.");
  if (process.platform !== "win32")
    throw Error("Run this Windows delivery helper on Windows.");
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw Error("Node.js 22.12 or later is required.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = await deliver(root);
  console.log(
    `\nBUILD VERIFIED: downloaded and checked the CI-tested executable.\n\nRun directly:\n${result.executable}\n\nInstaller:\n${result.installer}\n\nReceipt:\n${result.receipt}`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(`\nBUILD FAILED: ${error.message}`);
    process.exitCode = 1;
  });
