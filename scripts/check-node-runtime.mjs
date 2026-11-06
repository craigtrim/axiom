// craigtrim/axiom#207: prove the shipped runtime can retain live JS beyond Electron's cage.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeDefinition, verifyNodeRuntime } from "./setup-node-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const ceilingMiB = Math.floor(totalmem() / MiB);
if (
  process.platform !== "win32" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
  process.argv.length !== 3 ||
  process.argv[2] !== "--packaged"
)
  throw Error(
    "The runtime heap probe requires packaged files on a GitHub-hosted Windows runner.",
  );
if (totalmem() < 4.5 * GiB)
  throw Error(
    "The hosted heap probe needs at least 4.5 GiB of physical memory.",
  );

const directory = path.join(
  root,
  "artifacts/installer/win-unpacked/resources/node",
);
await verifyNodeRuntime(directory);
const executable = path.join(directory, "node.exe");
const source = String.raw`
const { totalmem } = require('node:os');
const { getHeapStatistics } = require('node:v8');
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const targetBytes = 3.5 * GiB;
const elements = MiB;
const chunks = [];
globalThis.__axiomMemoryProbe = chunks;
for (let index = 0; index < targetBytes / (elements * 8); index++) {
  chunks.push(new Array(elements).fill(0.5 + index / 1000));
  if (index % 64 === 63) global.gc();
}
global.gc();
const retained = process.memoryUsage();
const report = {
  version: process.version,
  electron: process.versions.electron ?? null,
  pointerCompression: Number(process.config.variables.v8_enable_pointer_compression),
  totalMemory: totalmem(),
  heapSizeLimit: getHeapStatistics().heap_size_limit,
  heapUsed: retained.heapUsed,
  arrayBuffers: retained.arrayBuffers,
  targetBytes,
  liveElements: chunks.reduce((count, values) => count + values.length, 0),
  checksum: chunks.reduce((sum, values) => sum + values[0] + values[values.length - 1], 0),
};
chunks.length = 0;
globalThis.__axiomMemoryProbe = undefined;
global.gc();
report.heapUsedAfterRelease = process.memoryUsage().heapUsed;
process.stdout.write(JSON.stringify(report));
`;
const env = { ...process.env };
delete env.NODE_OPTIONS;
delete env.ELECTRON_RUN_AS_NODE;
const report = await new Promise((resolve, reject) => {
  const child = spawn(
    executable,
    [`--max-old-space-size=${ceilingMiB}`, "--expose-gc", "-e", source],
    { env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let diagnostics = "";
  const timeout = setTimeout(() => {
    child.kill();
    reject(Error("The shipped Node heap probe exceeded 90 seconds."));
  }, 90_000);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.length > 65536) {
      child.kill();
      reject(Error("Unexpected output from the shipped Node heap probe."));
    }
  });
  child.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-16384);
  });
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("close", (code, signal) => {
    clearTimeout(timeout);
    if (code !== 0) {
      reject(
        Error(
          `The shipped Node heap probe stopped (${signal ?? code}): ${diagnostics}`,
        ),
      );
      return;
    }
    try {
      resolve(JSON.parse(output));
    } catch {
      reject(
        Error("The shipped Node heap probe did not return valid diagnostics."),
      );
    }
  });
});
if (
  report.version !== "v" + runtimeDefinition.version ||
  report.electron !== null ||
  report.pointerCompression !== 0 ||
  report.totalMemory !== totalmem() ||
  report.heapSizeLimit < ceilingMiB * MiB ||
  report.heapSizeLimit > (ceilingMiB + 256) * MiB ||
  report.heapUsed <= 3.35 * GiB ||
  report.liveElements * 8 !== report.targetBytes ||
  report.targetBytes !== 3.5 * GiB ||
  !Number.isFinite(report.checksum) ||
  report.checksum <= 0 ||
  report.heapUsedAfterRelease > 128 * MiB
)
  throw Error(
    "The shipped Node runtime did not meet the physical-memory heap contract: " +
      JSON.stringify(report),
  );
const output = path.join(root, "artifacts/node-runtime");
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "heap.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `Node ${runtimeDefinition.version}: retained ${(report.heapUsed / GiB).toFixed(2)} GiB of live JS; heap ceiling ${(report.heapSizeLimit / GiB).toFixed(2)} GiB on ${(report.totalMemory / GiB).toFixed(2)} GiB physical memory.`,
);
