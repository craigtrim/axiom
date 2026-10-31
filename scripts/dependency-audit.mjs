// #193: decide which npm audit advisories fail CI; check-dependency-audit.mjs runs the audit.
// Direct devDependencies that run only while packaging. Electron is not one: its runtime ships.
export const packagingTools = new Set([
  "electron-builder",
  "@electron/packager",
]);
// Each entry names its package and why the packaging tools cannot trigger the advisory.
export const acceptedAdvisories = {
  "GHSA-3g3m-2fjr-6pw4":
    "glob: no caller in the packaging tools passes the abort signal the advisory depends on.",
  "GHSA-g3hv-75wg-m249":
    "minimatch: the packaging tools match only patterns from this repository's configuration and files.",
};
// The same threshold as npm audit --audit-level=moderate.
const blocking = new Set(["moderate", "high", "critical"]);

export function findings(report) {
  if (
    !report?.vulnerabilities ||
    !report.metadata?.vulnerabilities ||
    report.error
  )
    throw Error(
      `npm could not audit the dependencies: ${report?.message || report?.error?.summary || "no audit report"}`,
    );
  const found = new Map();
  for (const { via, nodes } of Object.values(report.vulnerabilities))
    for (const source of via)
      if (typeof source === "object" && blocking.has(source.severity)) {
        const id = String(source.url ?? source.source)
          .split("/")
          .at(-1);
        const advisory = found.get(id) ?? {
          id,
          title: source.title,
          packages: new Set(),
          nodes: new Set(),
        };
        advisory.packages.add(source.name);
        for (const node of nodes) advisory.nodes.add(node);
        found.set(id, advisory);
      }
  return [...found.values()];
}

// Node's lookup: the nearest node_modules folder at or above the dependent.
function resolve(packages, from, name) {
  for (let folder = from; ;) {
    const candidate = `${folder && `${folder}/`}node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!folder) return undefined;
    folder = folder.slice(0, Math.max(0, folder.lastIndexOf("/node_modules/")));
  }
}

// The direct dependencies whose installed trees in package-lock.json contain the given paths.
export function dependencyRoots(lock, targets) {
  const packages = lock?.packages;
  if (!packages?.[""]) throw Error("package-lock.json has no package tree.");
  const dependents = new Map();
  for (const [from, entry] of Object.entries(packages))
    for (const name of Object.keys({
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...entry.peerDependencies,
      ...(from ? {} : entry.devDependencies),
    })) {
      const target = resolve(packages, from, name);
      if (target)
        dependents.set(target, [...(dependents.get(target) ?? []), from]);
    }
  const roots = new Set(),
    queue = [...targets],
    seen = new Set(queue);
  for (const node of queue) {
    if (!Object.hasOwn(packages, node))
      throw Error(`package-lock.json does not list ${node}; run npm ci.`);
    for (const parent of dependents.get(node) ?? [])
      if (!parent)
        roots.add(node.slice(node.lastIndexOf("node_modules/") + 13));
      else if (!seen.has(parent)) {
        seen.add(parent);
        queue.push(parent);
      }
  }
  return roots;
}

export function reviewAudit(
  production,
  full,
  lock,
  accepted = acceptedAdvisories,
) {
  const describe = ({ id, packages, title }) =>
    `${id} (${[...packages].join(", ")}): ${title}`;
  const failures = [],
    warnings = [],
    allowed = [],
    shipped = new Set();
  for (const advisory of findings(production)) {
    shipped.add(advisory.id);
    failures.push(`Production dependency: ${describe(advisory)}`);
  }
  const current = findings(full);
  for (const advisory of current) {
    if (shipped.has(advisory.id)) continue;
    if (!Object.hasOwn(accepted, advisory.id)) {
      failures.push(`Not on the accepted list: ${describe(advisory)}`);
      continue;
    }
    const roots = [...dependencyRoots(lock, advisory.nodes)],
      outside = roots.filter((root) => !packagingTools.has(root));
    if (!roots.length || outside.length)
      failures.push(
        `Accepted only through ${[...packagingTools].join(" and ")}, but reached through ${outside.join(", ") || "no direct dependency"}: ${describe(advisory)}`,
      );
    else
      allowed.push(
        `${describe(advisory)}. Through ${roots.join(" and ")}. ${accepted[advisory.id]}`,
      );
  }
  for (const id of Object.keys(accepted))
    if (!current.some((advisory) => advisory.id === id))
      warnings.push(
        `${id} no longer fails npm audit; remove it from the accepted list in scripts/dependency-audit.mjs.`,
      );
  return { failures, warnings, accepted: allowed };
}
