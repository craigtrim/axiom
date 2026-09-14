import { packager } from "@electron/packager";
import {
  mkdir,
  mkdtemp,
  cp,
  writeFile,
  readFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z"),
  out = path.join(root, "artifacts", "electron-" + stamp);
await mkdir(path.join(root, "artifacts", "package-input"), { recursive: true });
const stage = await mkdtemp(
  path.join(root, "artifacts", "package-input", "axiom-"),
);
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await cp("dist", path.join(stage, "dist"), {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
});
await writeFile(
  path.join(stage, "package.json"),
  JSON.stringify({
    name: pkg.name,
    productName: "Axiom",
    version: pkg.version,
    main: pkg.main,
    description: pkg.description,
    author: pkg.author,
  }),
);
await import("./notices.mjs");
await cp("LICENSES.md", path.join(stage, "LICENSES.md"));
await cp(
  "THIRD-PARTY-NOTICES.txt",
  path.join(stage, "THIRD-PARTY-NOTICES.txt"),
);
const dirs = await packager({
  dir: stage,
  out,
  name: "Axiom",
  icon: path.join(root, "assets/axiom.ico"),
  executableName: "Axiom",
  platform: "win32",
  arch: "x64",
  electronVersion: pkg.devDependencies.electron,
  asar: { unpackDir: "**/metadata" },
  extraResource: [
    path.join(root, "THIRD-PARTY-NOTICES.txt"),
    path.join(root, "LICENSES.md"),
  ],
  prune: false,
  overwrite: false,
  appVersion: pkg.version,
  buildVersion: pkg.version,
  win32metadata: {
    CompanyName: "Craig Trim",
    FileDescription: "Axiom Ontology Workbench",
    ProductName: "Axiom",
  },
});
const executable = path.join(dirs[0], "Axiom.exe");
await stat(executable);
await writeFile(
  "artifacts/latest-electron.json",
  JSON.stringify(
    {
      version: pkg.version,
      builtAt: new Date().toISOString(),
      directory: dirs[0],
      executable,
    },
    null,
    2,
  ),
);
console.log("Windows executable: " + executable);
