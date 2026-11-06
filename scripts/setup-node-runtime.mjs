// craigtrim/axiom#207: the ontology process uses a verified plain-Node runtime.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const runtimeDefinition = JSON.parse(
  await readFile(
    new URL("../config/node-runtime.json", import.meta.url),
    "utf8",
  ),
);

function validateDefinition(definition) {
  if (
    !/^22\.\d+\.\d+$/.test(definition.version) ||
    definition.platform !== "win32" ||
    definition.architecture !== "x64" ||
    !Array.isArray(definition.files) ||
    definition.files.length !== 2 ||
    !["node.exe", "LICENSE"].every(
      (name) =>
        definition.files.filter((file) => file.name === name).length === 1,
    )
  )
    throw Error("Invalid Node runtime definition.");
  for (const file of definition.files)
    if (
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      new URL(file.url).protocol !== "https:" ||
      (file.bytes !== undefined &&
        (!Number.isSafeInteger(file.bytes) || file.bytes < 0))
    )
      throw Error("Invalid Node runtime file definition.");
}

async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyNodeRuntime(
  directory,
  { definition = runtimeDefinition } = {},
) {
  validateDefinition(definition);
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw Error("Node runtime cache must be a regular directory.");
  const allowedNames = new Set([
    ...definition.files.map((file) => file.name),
    "package-manifest.json",
  ]);
  const inventory = await readdir(directory, { withFileTypes: true });
  if (
    inventory.length !== allowedNames.size ||
    inventory.some((entry) => !entry.isFile() || !allowedNames.has(entry.name))
  )
    throw Error("Node runtime directory contains unverified files.");
  const manifestFile = path.join(directory, "package-manifest.json");
  if (!(await lstat(manifestFile)).isFile())
    throw Error("Node runtime manifest must be a regular file.");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (
    manifest.schema !== 1 ||
    manifest.version !== definition.version ||
    manifest.platform !== definition.platform ||
    manifest.architecture !== definition.architecture ||
    Object.keys(manifest.files ?? {}).length !== definition.files.length
  )
    throw Error("Node runtime manifest does not match the pinned release.");
  for (const expected of definition.files) {
    const file = path.join(directory, expected.name);
    const info = await lstat(file);
    const record = manifest.files[expected.name];
    if (
      !info.isFile() ||
      !record ||
      record.sha256 !== expected.sha256 ||
      record.bytes !== info.size ||
      (expected.bytes !== undefined && info.size !== expected.bytes) ||
      (await fileDigest(file)) !== expected.sha256
    )
      throw Error("Node runtime checksum mismatch: " + expected.name);
  }
  return manifest;
}

function requireOwnedDirectory(directory, parent, prefix) {
  const absolute = path.resolve(directory);
  if (
    path.dirname(absolute) !== path.resolve(parent) ||
    !path.basename(absolute).startsWith(prefix)
  )
    throw Error("Invalid runtime staging directory.");
  return absolute;
}

export async function ensureNodeRuntime({
  root = projectRoot,
  definition = runtimeDefinition,
  fetcher = globalThis.fetch,
  platform = process.platform,
} = {}) {
  if (platform !== "win32")
    throw Error("Axiom's bundled Node runtime targets Windows x64.");
  validateDefinition(definition);
  const vendor = path.resolve(root, "vendor");
  const target = path.join(vendor, "node");
  try {
    await verifyNodeRuntime(target, { definition });
    return target;
  } catch {
    // A missing or changed cache is replaced only after a complete verified download.
  }
  await mkdir(vendor, { recursive: true });
  const staging = await mkdtemp(path.join(vendor, ".node-stage-"));
  const backup = path.join(vendor, ".node-backup-" + randomUUID());
  let movedPrevious = false;
  let installed = false;
  try {
    const files = {};
    for (const expected of definition.files) {
      const response = await fetcher(expected.url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok)
        throw Error(
          `Node runtime download failed: ${response.status} ${expected.name}`,
        );
      const content = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(content).digest("hex");
      if (
        sha256 !== expected.sha256 ||
        (expected.bytes !== undefined && content.length !== expected.bytes)
      )
        throw Error(
          "Node runtime download checksum mismatch: " + expected.name,
        );
      await writeFile(path.join(staging, expected.name), content);
      files[expected.name] = { sha256, bytes: content.length };
    }
    await writeFile(
      path.join(staging, "package-manifest.json"),
      JSON.stringify(
        {
          schema: 1,
          version: definition.version,
          platform: definition.platform,
          architecture: definition.architecture,
          files,
        },
        null,
        2,
      ) + "\n",
    );
    await verifyNodeRuntime(staging, { definition });
    try {
      await rename(target, backup);
      movedPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, target);
      installed = true;
    } catch (error) {
      if (movedPrevious) {
        await rename(backup, target);
        movedPrevious = false;
      }
      throw error;
    }
    return target;
  } finally {
    if (!installed)
      await rm(requireOwnedDirectory(staging, vendor, ".node-stage-"), {
        recursive: true,
        force: true,
      });
    if (installed && movedPrevious)
      await rm(requireOwnedDirectory(backup, vendor, ".node-backup-"), {
        recursive: true,
        force: true,
      });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const directory = await ensureNodeRuntime();
  console.log(`Node ${runtimeDefinition.version}: verified ${directory}`);
}
