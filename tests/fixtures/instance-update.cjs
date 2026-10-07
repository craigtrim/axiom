// Exercise the packaged quit/update lifecycle without ever running an installer.
const { app } = require("electron");
const childProcess = require("node:child_process");
const { appendFileSync } = require("node:fs");
const { EventEmitter } = require("node:events");
const log = process.env.AXIOM_TEST_UPDATE_LOG;
if (!log) throw Error("This preload requires its isolated test log.");
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
