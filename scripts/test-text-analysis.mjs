import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const executable = process.platform === "win32" ? "mutatoc.exe" : "mutatoc";
const candidates = process.env.AXIOM_MUTATOC_HOME
  ? [path.resolve(process.env.AXIOM_MUTATOC_HOME)]
  : [
      path.join(root, "vendor/mutatoc"),
      path.resolve(root, "../mutatos/mutatoc/dist/mutatoc-win-x64-0.3.1"),
    ];
const home = candidates.find((folder) =>
  existsSync(path.join(folder, executable)),
);
if (!home) {
  console.error(
    "Text Analysis tests require the complete native runtime. Run npm run setup:mutatoc or set AXIOM_MUTATOC_HOME. No native tests were run.",
  );
  process.exit(1);
}
const child = spawn(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/domain/text-analysis.test.ts",
    "tests/domain/text-analysis-runtime.test.ts",
    "tests/domain/text-analysis-punctuation.test.ts",
    "tests/domain/text-analysis-reference.test.ts",
    "tests/domain/text-analysis-service.test.ts",
    "tests/domain/text-analysis-navigation.test.ts",
    "tests/domain/text-analysis-authoring.test.ts",
    "tests/domain/text-analysis-session.test.ts",
    "tests/domain/selected-entity-name.test.ts",
    "tests/domain/mutatoc-client.test.ts",
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    env: { ...process.env, AXIOM_MUTATOC_HOME: home },
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
