// craigtrim/axiom#207: plain Node reads the unpacked data-service files directly.
import { existsSync } from "node:fs";
import path from "node:path";

export function domainRuntimePaths(
  appPath: string,
  resourcesPath: string,
  packaged: boolean,
) {
  const executable = packaged
    ? path.join(resourcesPath, "node", "node.exe")
    : path.join(appPath, "vendor", "node", "node.exe");
  const entrypoint = path.join(
    packaged ? appPath + ".unpacked" : appPath,
    "dist",
    "main",
    "domain-worker.cjs",
  );
  const launcher = path.join(path.dirname(entrypoint), "domain-launcher.cjs");
  if (!existsSync(executable))
    throw Error(
      packaged
        ? "The ontology runtime is missing. Reinstall the complete Axiom application."
        : "The ontology runtime is missing. Run npm run setup:node, then build Axiom.",
    );
  if (!existsSync(entrypoint))
    throw Error(
      packaged
        ? "The ontology service files are missing. Reinstall the complete Axiom application."
        : "The ontology service has not been built. Run npm run build.",
    );
  if (!existsSync(launcher))
    throw Error(
      packaged
        ? "The ontology launcher files are missing. Reinstall the complete Axiom application."
        : "The ontology launcher has not been built. Run npm run build.",
    );
  return { executable, entrypoint, launcher };
}
