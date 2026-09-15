import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = (args, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
const args = process.argv.slice(2);
// A packaged executable supplies its own build. --list never calls a model.
if (!process.env.AXIOM_TEST_EXE && !args.includes("--list")) {
  const code = await run(["scripts/build.mjs"]);
  if (code) process.exit(code);
}
process.exit(
  await run(
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "playwright.codex.config.ts",
      ...args,
    ],
    { ...process.env, AXIOM_LIVE_CODEX: "1" },
  ),
);
