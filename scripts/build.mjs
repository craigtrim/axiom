import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdir, copyFile, writeFile, rm, cp } from "node:fs/promises";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = path.resolve(projectRoot, "dist");
if (path.dirname(outputRoot) !== path.resolve(projectRoot))
  throw Error("Invalid output path");
await rm(outputRoot, { recursive: true, force: true });
await mkdir("dist/renderer", { recursive: true });
const base = {
  bundle: true,
  sourcemap: true,
  minify: true,
  logLevel: "info",
  target: "es2022",
};
await Promise.all([
  build({
    ...base,
    entryPoints: ["src/main/main.ts"],
    outfile: "dist/main/main.cjs",
    platform: "node",
    external: ["electron"],
    format: "cjs",
  }),
  build({
    ...base,
    entryPoints: ["src/main/preload.ts"],
    outfile: "dist/main/preload.cjs",
    platform: "node",
    external: ["electron"],
    format: "cjs",
  }),
  build({
    ...base,
    entryPoints: ["src/main/domain-worker.ts"],
    outfile: "dist/main/domain-worker.cjs",
    platform: "node",
    external: ["electron"],
    format: "cjs",
  }),
  build({
    ...base,
    entryPoints: ["src/main/query-worker.ts"],
    outfile: "dist/main/query-worker.cjs",
    platform: "node",
    format: "cjs",
  }),
  build({
    ...base,
    entryPoints: ["src/main/provenance-worker.ts"],
    outfile: "dist/main/provenance-worker.cjs",
    platform: "node",
    format: "cjs",
  }),
  build({
    ...base,
    entryPoints: ["src/main/layout-worker.ts"],
    outfile: "dist/main/layout-worker.cjs",
    platform: "node",
    format: "cjs",
  }),
  build({
    ...base,
    entryPoints: ["src/renderer/index.tsx"],
    outdir: "dist/renderer",
    entryNames: "app",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    platform: "browser",
    format: "esm",
    loader: { ".ttf": "file" },
    assetNames: "assets/[name]-[hash]",
    define: { "process.env.NODE_ENV": '"production"' },
  }),
  build({
    ...base,
    entryPoints: ["node_modules/monaco-editor/esm/vs/editor/editor.worker.js"],
    outfile: "dist/renderer/editor.worker.js",
    platform: "browser",
    format: "iife",
  }),
]);
await copyFile("src/renderer/index.html", "dist/renderer/index.html");
await copyFile("src/renderer/popout.html", "dist/renderer/popout.html");
await writeFile(
  "dist/build.json",
  JSON.stringify(
    { version: "1.0.0", builtAt: new Date().toISOString() },
    null,
    2,
  ),
);

await mkdir("dist/metadata", { recursive: true });
await copyFile(
  "src/main/windows-metadata.cs",
  "dist/metadata/windows-metadata.cs",
);
await copyFile(
  "src/main/windows-metadata.ps1",
  "dist/metadata/windows-metadata.ps1",
);
await cp("node_modules/exiftool-vendored.exe/bin", "dist/metadata/exiftool", {
  recursive: true,
});
await mkdir("dist/assets", { recursive: true });
await copyFile("assets/axiom.ico", "dist/assets/axiom.ico");
