// craigtrim/axiom#6
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const config = require("../../electron-builder.config.cjs");
const nsh = readFileSync("build/installer.nsh", "utf8");
const main = readFileSync("src/main/main.ts", "utf8");

it("installs per user so no elevation is required", () => {
  expect(config.nsis.perMachine).toBe(false);
  expect(config.nsis.allowElevation).toBe(false);
});
it("keeps the application identifier the main process sets at runtime", () => {
  expect(config.appId).toBe("com.craigtrim.axiom");
  expect(main).toContain('app.setAppUserModelId("' + config.appId + '")');
});
it("leaves file associations to the custom include", () => {
  // electron-builder emits fileAssociations only for a per-machine install, so the
  // option must stay unset or the build fails against perMachine false.
  expect(config.fileAssociations).toBeUndefined();
  expect(config.nsis.include).toBe("build/installer.nsh");
});
it("registers the ProgID, the extension and the open command on install", () => {
  const install = nsh.slice(
    nsh.indexOf("!macro customInstall"),
    nsh.indexOf("!macroend"),
  );
  expect(install).toContain(
    'WriteRegStr HKCU "Software\\Classes\\.axiom" "" "Axiom.Workspace"',
  );
  expect(install).toContain(
    'WriteRegStr HKCU "Software\\Classes\\Axiom.Workspace\\shell\\open\\command" "" \'"$INSTDIR\\Axiom.exe" "%1"\'',
  );
  expect(install).toContain(
    'WriteRegStr HKCU "Software\\Classes\\Axiom.Workspace\\DefaultIcon" "" "$INSTDIR\\Axiom.exe,0"',
  );
});
it("notifies the shell after both install and uninstall", () => {
  expect(nsh.match(/SHChangeNotify\(i 0x08000000/g)).toHaveLength(2);
});
it("removes the ProgID on uninstall and leaves the extension default alone", () => {
  const uninstall = nsh.slice(nsh.indexOf("!macro customUnInstall"));
  expect(uninstall).toContain(
    'DeleteRegKey HKCU "Software\\Classes\\Axiom.Workspace"',
  );
  // Microsoft's guidance: another application may own the type by now, and Windows
  // ignores a Default value naming a ProgID that is no longer registered.
  expect(uninstall).not.toContain(
    'DeleteRegKey HKCU "Software\\Classes\\.axiom"',
  );
  expect(uninstall).not.toMatch(
    /DeleteRegValue HKCU "Software\\Classes\\.axiom" ""/,
  );
});
it("publishes to GitHub Releases so electron-updater has a feed", () => {
  expect(config.publish).toEqual([
    { provider: "github", owner: "craigtrim", repo: "axiom" },
  ]);
});
it("signs only when an Azure signing endpoint is configured", () => {
  // The build must stay usable without a certificate rather than failing closed.
  expect(config.win.azureSignOptions).toBeUndefined();
  const source = readFileSync("electron-builder.config.cjs", "utf8");
  expect(source).toContain("AXIOM_AZURE_SIGNING_ENDPOINT");
  expect(source).toContain("certificateProfileName");
});
