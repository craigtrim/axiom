import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.resolve(root, "vendor/mutatoc");
const candidate = process.env.AXIOM_MUTATOC_HOME ?? process.argv[2];
const source = candidate
  ? path.resolve(candidate)
  : existsSync(path.join(target, "package-manifest.json"))
    ? target
    : path.resolve(root, "../mutatos/mutatoc/dist/mutatoc-win-x64-0.2.2");
let manifest;
try {
  manifest = JSON.parse(
    await readFile(path.join(source, "package-manifest.json"), "utf8"),
  );
} catch {
  throw Error(
    "Install the complete mutatoc 0.2.2 Windows package: npm run setup:mutatoc -- <extracted-package-folder>",
  );
}
if (manifest.version !== "0.2.2")
  throw Error("Axiom requires the tested mutatoc 0.2.2 runtime.");
const entries = Object.entries(manifest.files);
for (const required of [
  "mutatoc.exe",
  "runtime/python/python.exe",
  "runtime/spacy_worker.py",
  "runtime/sparql_worker.py",
  "THIRD_PARTY_NOTICES.md",
])
  if (!Object.hasOwn(manifest.files, required))
    throw Error("Incomplete mutatoc package: " + required);
// Validate the source before replacing the local runtime. Copy only manifested
// files so unrelated source files and Python caches cannot enter the installer.
for (const [relative, record] of entries) {
  if (
    relative.split(/[\\/]/).some((part) => part === "..") ||
    path.isAbsolute(relative)
  )
    throw Error("Invalid package path.");
  const content = await readFile(path.join(source, relative));
  if (
    content.length !== record.bytes ||
    createHash("sha256").update(content).digest("hex") !== record.sha256
  )
    throw Error("mutatoc checksum mismatch: " + relative);
}
if (source !== target) {
  if (
    path.dirname(target) !== path.resolve(root, "vendor") ||
    path.basename(target) !== "mutatoc"
  )
    throw Error("Invalid runtime target.");
  await rm(target, { recursive: true, force: true });
  for (const [relative] of entries) {
    const destination = path.join(target, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(source, relative), destination);
  }
  await writeFile(
    path.join(target, "package-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
// Reject retired dependencies even if an environment was edited after extraction.
const packages = await readdir(
  path.join(target, "runtime/python/Lib/site-packages"),
);
if (
  packages.some((name) =>
    /^(lingpatlab|wordnet_lookup|unicodedata2)([-.]|$)/i.test(name),
  )
)
  throw Error("The runtime contains a retired LingPatLab dependency.");
console.log(
  `mutatoc ${manifest.version}: verified ${entries.length} packaged files in ${target}`,
);
