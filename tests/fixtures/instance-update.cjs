// Exercise the packaged quit/update lifecycle without ever running an installer.
const { app } = require("electron");
const childProcess = require("node:child_process");
const {
  appendFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
} = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const log = process.env.AXIOM_TEST_UPDATE_LOG;
if (!log) throw Error("This preload requires its isolated test log.");
// craigtrim/axiom#207: packaged mode also needs the real unpacked ontology runtime.
// Keep those paths inside this fixture's installation, with no installer execution.
const source = path.resolve(__dirname, "../..");
const resources = path.join(
  path.dirname(log),
  "update-installation",
  "resources",
);
const application = path.join(resources, "app.asar");
const unpacked = application + ".unpacked";
mkdirSync(path.join(unpacked, "dist"), { recursive: true });
for (const [target, link] of [
  [path.join(source, "dist", "main"), path.join(unpacked, "dist", "main")],
  [path.join(source, "node_modules"), path.join(unpacked, "node_modules")],
  [path.join(source, "vendor", "node"), path.join(resources, "node")],
  [path.join(source, "vendor", "mutatoc"), path.join(resources, "mutatoc")],
]) {
  if (existsSync(target) && !existsSync(link))
    symlinkSync(
      target,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
}
Object.defineProperty(process, "resourcesPath", { value: resources });
app.getAppPath = () => application;
Object.defineProperty(app, "isPackaged", { value: true });
const spawn = childProcess.spawn;
childProcess.spawn = function (file, args, options) {
  if (args?.includes("--updated")) {
    appendFileSync(
      log,
      JSON.stringify({ file, args, pid: process.pid }) + "\n",
    );
    return Object.assign(new EventEmitter(), { unref() {} });
  }
  return spawn.call(this, file, args, options);
};
