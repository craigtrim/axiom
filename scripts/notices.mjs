import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = [
  "THIRD-PARTY SOFTWARE NOTICES",
  "This file covers bundled JavaScript dependencies. Electron, Chromium and Node.js notices also accompany the executable.",
];
const supplemental = new Map([
  ["@rubensworks/saxes@6.0.1", "licenses/rubensworks-saxes-LICENSE.txt"],
  ["undici-types@5.26.5", "licenses/undici-types-5.26.5-LICENSE.txt"],
]);
const declaredMit = new Set([
  "asyncjoin@1.2.5",
  "sparqlalgebrajs@5.0.2",
  "tr46@0.0.3",
]);
for (const [location, metadata] of Object.entries(lock.packages)) {
  if (!location || metadata.dev) continue;
  let pkg;
  try {
    pkg = JSON.parse(
      await readFile(path.join(location, "package.json"), "utf8"),
    );
  } catch (error) {
    // npm omits platform-specific optional dependencies, such as macOS fsevents.
    if (
      error.code === "ENOENT" &&
      metadata.optional &&
      metadata.os?.length &&
      !metadata.os.includes(process.platform)
    )
      continue;
    throw error;
  }
  const names = (await readdir(location)).filter((n) =>
    /^(license|licence|copying|notice)([.-]|$)/i.test(n),
  );
  const key = pkg.name + "@" + pkg.version;
  const license =
    metadata.license ??
    pkg.license ??
    pkg.licenses?.map((l) => l.type).join(", ");
  notices.push(
    "\n" + "=".repeat(72),
    pkg.name + " " + pkg.version + " (" + license + ")",
  );
  if (names.length) {
    for (const name of names)
      notices.push(await readFile(path.join(location, name), "utf8"));
  } else if (supplemental.has(key))
    notices.push(await readFile(supplemental.get(key), "utf8"));
  else if (
    pkg.name.startsWith("@comunica/") &&
    pkg.version === "5.4.0" &&
    pkg.gitHead === "8a0a10913cb705adda45997210ebbe5502274a60" &&
    (pkg.repository?.url === "https://github.com/comunica/comunica.git" ||
      pkg.repository ===
        "https://github.com/comunica/comunica/tree/master/packages/actor-query-operation-update-deleteinsert")
  )
    notices.push(await readFile("licenses/comunica-5.4.0-LICENSE.txt", "utf8"));
  else if (key === "hash.js@1.1.7" || key === "imurmurhash@0.1.4") {
    const readme = await readFile(path.join(location, "README.md"), "utf8");
    const offset = readme.search(/^#### LICENSE|^License \(MIT\)/m);
    if (offset < 0) throw Error("Missing embedded license for " + key);
    notices.push(readme.slice(offset));
  } else if (key === "negotiate@1.0.1") {
    const source = await readFile(path.join(location, "negotiate.js"), "utf8");
    const notice = source.match(
      /\/\*\s*\n \* Copyright 2010 Gary Court[\s\S]*?\*\//,
    )?.[0];
    if (!notice) throw Error("Missing embedded license for " + key);
    notices.push(notice);
  } else if (declaredMit.has(key) && pkg.license === "MIT") {
    notices.push(
      "The published package declares MIT in package.json and supplies no separate license file.",
    );
    if (pkg.author)
      notices.push(
        "Package author: " +
          (typeof pkg.author === "string" ? pkg.author : pkg.author.name),
      );
    notices.push(
      "Package metadata: https://registry.npmjs.org/" +
        pkg.name +
        "/" +
        pkg.version,
    );
    // These packages provide no copyright notice. Retain their declared license
    // using SPDX's standard permission/disclaimer text without inventing one.
    const mit = await readFile("licenses/MIT.txt", "utf8");
    notices.push(mit.slice(mit.indexOf("Permission is hereby granted")));
  } else throw Error("Missing license for " + key);
}
await writeFile("THIRD-PARTY-NOTICES.txt", notices.join("\n\n").replace(/[ \t]+$/gm, ""));
console.log("Bundled dependency notices written.");
