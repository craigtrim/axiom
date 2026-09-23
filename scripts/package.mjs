// craigtrim/axiom#6: builds Axiom-Setup.exe, replacing the loose packaged folder.
import { build, Platform } from "electron-builder";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const config = require("../electron-builder.config.cjs");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await import("./notices.mjs");
const outputs = await build({
  targets: Platform.WINDOWS.createTarget(),
  config,
});
const installer = outputs.find((file) => file.toLowerCase().endsWith(".exe"));
if (!installer) throw Error("electron-builder produced no installer.");
// The unpacked application is what the desktop tests run against.
const directory = path.resolve(config.directories.output, "win-unpacked");
const executable = path.join(directory, "Axiom.exe");
await stat(executable);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/latest-electron.json",
  JSON.stringify(
    {
      version: pkg.version,
      builtAt: new Date().toISOString(),
      directory,
      executable,
      installer: path.resolve(installer),
      signed: !!process.env.AXIOM_AZURE_SIGNING_ENDPOINT,
    },
    null,
    2,
  ),
);
console.log("Windows installer: " + path.resolve(installer));
console.log("Windows executable: " + executable);
