import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { command } from "./ci-build-gate.mjs";
import {
  localDesktopCases,
  verifyLocalDesktopResults,
} from "./hybrid-test-policy.mjs";
export async function validateLocalDesktop(root, source, runCommand = command) {
  const validationId = randomUUID();
  console.log(
    `Running ${localDesktopCases.length} required local desktop tests; windows may take focus...`,
  );
  await runCommand(
    process.execPath,
    ["scripts/test-local-desktop.mjs", "--validation-id", validationId],
    root,
  );
  const output = path.join(root, "artifacts/local-desktop");
  const proof = JSON.parse(
    (await readFile(path.join(output, "receipt.json"), "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
  const bytes = await readFile(path.join(output, "results.json"));
  const coverage = verifyLocalDesktopResults(JSON.parse(bytes));
  if (
    proof.schema !== 1 ||
    proof.validationId !== validationId ||
    proof.source?.commit !== source.commit ||
    proof.source?.tree !== source.tree ||
    proof.listed !== coverage.listed ||
    proof.passed !== coverage.passed ||
    proof.skipped?.length !== 0 ||
    proof.resultsSha256 !== createHash("sha256").update(bytes).digest("hex") ||
    !Number.isFinite(Date.parse(proof.completedAt))
  )
    throw Error(
      "Local desktop evidence is stale, incomplete, or does not match this source revision.",
    );
  return proof;
}
