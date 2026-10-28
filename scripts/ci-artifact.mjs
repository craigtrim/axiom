// #166: verify and deliver the same packaged bytes exercised on hosted Windows.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { repository, workflowPath } from "./ci-build-gate.mjs";
export async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest("hex");
}
export function contained(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.includes("\0") ||
    relative
      .split("/")
      .some(
        (part) => !part || part === "." || part === ".." || /[. ]$/.test(part),
      )
  )
    throw Error(`Invalid artifact path: ${relative}`);
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep))
    throw Error("Artifact path escapes its directory.");
  return target;
}
export async function inventory(root) {
  const files = Object.create(null);
  const seen = new Set();
  async function visit(directory, prefix = "") {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw Error("Artifact directories must not be links.");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const file = contained(root, relative);
      if (seen.has(relative.toLowerCase()))
        throw Error("Duplicate artifact path.");
      seen.add(relative.toLowerCase());
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw Error("Artifact links are not allowed.");
      if (info.isDirectory()) await visit(file, relative + "/");
      else if (info.isFile())
        files[relative] = { bytes: info.size, sha256: await fileDigest(file) };
      else throw Error("Artifact contains a non-regular file.");
    }
  }
  await visit(root);
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
  );
}
export async function verifyCandidate(stage, source, run) {
  const entries = await readdir(stage);
  if (
    entries.length !== 2 ||
    !entries.includes("candidate.json") ||
    !entries.includes("installer")
  )
    throw Error(
      "Candidate must contain only its receipt and installer directory.",
    );
  const receiptFile = path.join(stage, "candidate.json");
  if (
    !(await lstat(receiptFile)).isFile() ||
    (await lstat(receiptFile)).isSymbolicLink()
  )
    throw Error("Candidate receipt is not a regular file.");
  const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
  if (
    receipt.schema !== 1 ||
    receipt.repository !== repository ||
    receipt.workflowPath !== workflowPath ||
    receipt.source?.commit !== source.commit ||
    receipt.source?.tree !== source.tree ||
    !/^[a-f0-9]{40}$/.test(receipt.source?.checkoutCommit ?? "") ||
    receipt.run?.id !== run.id ||
    receipt.run?.attempt !== run.run_attempt ||
    receipt.run?.url !== run.html_url ||
    receipt.packagedDesktopChecksPassed !== 8 ||
    receipt.semanticChecksIncluded !== true ||
    !/^[a-f0-9]{64}$/.test(receipt.verification?.executableSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt.verification?.installerSha256 ?? "") ||
    !(receipt.verification?.checkedBuildFiles > 0) ||
    !(receipt.verification?.checkedRuntimeFiles > 0)
  )
    throw Error(
      "Candidate provenance does not match the successful source revision and CI attempt.",
    );
  const metadata = receipt.package;
  if (
    metadata?.directory !== "win-unpacked" ||
    metadata.executable !== "win-unpacked/Axiom.exe" ||
    typeof metadata.installer !== "string" ||
    !/^Axiom-Setup-[^/\\]+\.exe$/.test(metadata.installer)
  )
    throw Error("Candidate executable paths are invalid.");
  const actual = await inventory(path.join(stage, "installer"));
  const expected = receipt.files;
  if (!expected || !Object.keys(expected).length)
    throw Error("Candidate checksum manifest is missing.");
  for (const name of Object.keys(expected))
    contained(path.join(stage, "installer"), name);
  if (
    JSON.stringify(Object.keys(actual).sort()) !==
    JSON.stringify(Object.keys(expected).sort())
  )
    throw Error("Candidate file inventory differs from its checksum manifest.");
  for (const [name, file] of Object.entries(actual))
    if (
      file.bytes !== expected[name].bytes ||
      file.sha256 !== expected[name].sha256
    )
      throw Error(`Candidate checksum mismatch: ${name}`);
  if (
    actual[metadata.executable]?.sha256 !==
      receipt.verification.executableSha256 ||
    actual[metadata.installer]?.sha256 !== receipt.verification.installerSha256
  )
    throw Error(
      "Executable or installer checksum does not match package verification.",
    );
  return receipt;
}
async function present(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export async function safeDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw Error(`Delivery directory must not be a link: ${directory}`);
}
export async function promoteCandidate(
  stage,
  root,
  candidate,
  run,
  move = rename,
) {
  const artifacts = path.join(root, "artifacts");
  const receipts = path.join(artifacts, "build-exe");
  await safeDirectory(artifacts);
  await safeDirectory(receipts);
  const token = randomUUID();
  const installer = path.join(artifacts, "installer");
  const metadata = {
    ...candidate.package,
    directory: contained(installer, candidate.package.directory),
    executable: contained(installer, candidate.package.executable),
    installer: contained(installer, candidate.package.installer),
  };
  const receipt = {
    ...candidate,
    package: metadata,
    deliveredAt: new Date().toISOString(),
    run: { ...candidate.run, conclusion: run.conclusion, status: run.status },
  };
  const latest = path.join(artifacts, "latest-electron.json");
  const receiptPath = path.join(receipts, "receipt.json");
  const stagedMetadata = latest + ".next-" + token;
  const stagedReceipt = receiptPath + ".next-" + token;
  await writeFile(stagedMetadata, JSON.stringify(metadata, null, 2) + "\n");
  await writeFile(stagedReceipt, JSON.stringify(receipt, null, 2) + "\n");
  const items = [
    { from: path.join(stage, "installer"), to: installer },
    { from: stagedMetadata, to: latest },
    { from: stagedReceipt, to: receiptPath },
  ].map((item) => ({
    ...item,
    backup: item.to + ".previous-" + token,
    saved: false,
    installed: false,
  }));
  try {
    for (const item of items) {
      const existing = await present(item.to);
      if (existing?.isSymbolicLink())
        throw Error(`Existing delivery path is a link: ${item.to}`);
      if (existing) {
        await move(item.to, item.backup);
        item.saved = true;
      }
      await move(item.from, item.to);
      item.installed = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...items].reverse()) {
      try {
        if (item.installed) await move(item.to, item.from);
        if (item.saved) await move(item.backup, item.to);
      } catch {
        rollbackErrors.push(item.backup);
      }
    }
    if (rollbackErrors.length)
      throw Error(
        `Delivery failed: ${error.message}. Previous files are preserved at: ${rollbackErrors.join(", ")}`,
      );
    throw Error(
      `Delivery failed; the previous executable and receipts were restored: ${error.message}`,
    );
  } finally {
    for (const file of [stagedMetadata, stagedReceipt])
      await rm(file, { force: true }).catch(() => {});
  }
  for (const item of items)
    if (item.saved)
      await rm(item.backup, { recursive: true, force: true }).catch(() =>
        console.warn(`Previous delivery retained: ${item.backup}`),
      );
  return { ...metadata, receipt: receiptPath };
}
