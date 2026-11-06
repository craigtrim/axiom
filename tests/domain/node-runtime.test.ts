// craigtrim/axiom#207: installed data-service files must be readable by plain Node.
import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { domainRuntimePaths } from "../../src/main/node-runtime";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    expect(path.dirname(path.resolve(directory))).toBe(
      path.resolve(os.tmpdir()),
    );
    expect(path.basename(directory)).toMatch(/^axiom-node-paths-/);
    await rm(directory, { recursive: true, force: true });
  }
});
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "axiom-node-paths-"));
  directories.push(root);
  return root;
}
async function file(name: string) {
  await mkdir(path.dirname(name), { recursive: true });
  await writeFile(name, "fixture");
}

it("uses the bundled executable and unpacked service in an installed application", async () => {
  const root = await directory();
  const resources = path.join(root, "resources");
  const app = path.join(resources, "app.asar");
  const executable = path.join(resources, "node", "node.exe");
  const entrypoint = path.join(
    app + ".unpacked",
    "dist",
    "main",
    "domain-worker.cjs",
  );
  await file(executable);
  await file(entrypoint);
  expect(domainRuntimePaths(app, resources, true)).toEqual({
    executable,
    entrypoint,
  });
});

it("uses the verified vendor runtime and built service in a source checkout", async () => {
  const root = await directory();
  const executable = path.join(root, "vendor", "node", "node.exe");
  const entrypoint = path.join(root, "dist", "main", "domain-worker.cjs");
  await file(executable);
  await file(entrypoint);
  expect(domainRuntimePaths(root, "unused", false)).toEqual({
    executable,
    entrypoint,
  });
});

it("refuses a missing runtime instead of falling back to Electron or PATH", async () => {
  const root = await directory();
  await file(path.join(root, "dist", "main", "domain-worker.cjs"));
  expect(() => domainRuntimePaths(root, "unused", false)).toThrow(
    /npm run setup:node/,
  );
  expect(() =>
    domainRuntimePaths(path.join(root, "app.asar"), root, true),
  ).toThrow(/Reinstall/);
});

it("refuses a worker held only inside the application archive", async () => {
  const root = await directory();
  await file(path.join(root, "node", "node.exe"));
  expect(() =>
    domainRuntimePaths(path.join(root, "app.asar"), root, true),
  ).toThrow(/service files are missing/);
});

it("ships the runtime and unpacks every child bundle and its external dependencies", () => {
  const require = createRequire(import.meta.url);
  const config = require("../../config/electron-builder.config.cjs");
  expect(config.extraResources).toContainEqual({
    from: "vendor/node",
    to: "node",
  });
  for (const name of ["domain", "layout", "embedding", "query"])
    expect(config.asarUnpack).toContain(`dist/main/${name}-worker.cjs`);
  expect(config.asarUnpack).toContain("node_modules/**/*");
  expect(config.asarUnpack).not.toContain("dist/main/main.cjs");
  expect(config.asarUnpack).not.toContain("dist/main/preload.cjs");
});
