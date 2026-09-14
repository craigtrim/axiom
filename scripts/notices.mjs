import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = [
  "THIRD-PARTY SOFTWARE NOTICES",
  "This file covers bundled JavaScript dependencies. Electron, Chromium and Node.js notices also accompany the executable.",
];
for (const [location, metadata] of Object.entries(lock.packages)) {
  if (!location || metadata.dev) continue;
  const pkg = JSON.parse(
    await readFile(path.join(location, "package.json"), "utf8"),
  );
  const names = (await readdir(location)).filter((n) =>
    /^(license|licence|copying|notice)([.-]|$)/i.test(n),
  );
  const supplemental =
    pkg.name === "@rubensworks/saxes" && pkg.version === "6.0.1"
      ? "licenses/rubensworks-saxes-LICENSE.txt"
      : undefined;
  if (!names.length && !supplemental)
    throw Error("Missing license for " + pkg.name);
  notices.push(
    "\n" + "=".repeat(72),
    pkg.name +
      " " +
      pkg.version +
      " (" +
      String(metadata.license ?? pkg.license) +
      ")",
  );
  if (!names.length && supplemental)
    notices.push(await readFile(supplemental, "utf8"));
  for (const name of names)
    notices.push(await readFile(path.join(location, name), "utf8"));
}
await writeFile("THIRD-PARTY-NOTICES.txt", notices.join("\n\n"));
console.log("Bundled dependency notices written.");
