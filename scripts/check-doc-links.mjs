// Check maintained documentation without rewriting published test fixtures.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const documents = [
  "README.md",
  "licenses/LICENSES.md",
  "archive/README.md",
  "licenses/README.md",
  "scripts/README.md",
];
function collect(directory) {
  for (const entry of readdirSync(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (file.endsWith(".md")) documents.push(file);
  }
}
collect("docs");
let checked = 0;
const missing = [];
for (const file of documents) {
  const text = readFileSync(path.join(root, file), "utf8").replace(
    /```[\s\S]*?```/g,
    "",
  );
  const targets = [
    ...text.matchAll(/!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)[^)\n]*\)/g),
    ...text.matchAll(
      /^\[[^\]\n]+\]:[ \t]*(<[^>\n]+>|\S+)(?:[ \t]+["'(].*["')])?[ \t]*$/gm,
    ),
  ];
  for (const match of targets) {
    const href = match[1].replace(/^<|>$/g, "");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("//") ||
      /^[a-z][a-z\d+.-]*:/i.test(href)
    )
      continue;
    const target = path.resolve(
      root,
      path.dirname(file),
      decodeURIComponent(href.split(/[?#]/)[0]),
    );
    const relative = path.relative(root, target).replaceAll("\\", "/");
    // Build evidence and machine-local material need not exist in a fresh clone.
    if (/^(artifacts|local|specs)\//.test(relative)) continue;
    checked++;
    if (!existsSync(target)) missing.push(`${file}: ${href}`);
  }
}
if (missing.length) {
  console.error("Missing documentation targets:\n" + missing.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${checked} local links in ${documents.length} maintained documents.`,
  );
