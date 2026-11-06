// craigtrim/axiom#6
// craigtrim/axiom#206: terminal launchers and PATH edits preserve the user's environment.
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
const require = createRequire(import.meta.url);
const config = require("../../config/electron-builder.config.cjs");
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
  const source = readFileSync("config/electron-builder.config.cjs", "utf8");
  expect(source).toContain("AXIOM_AZURE_SIGNING_ENDPOINT");
  expect(source).toContain("certificateProfileName");
});

it("ships terminal launchers beside the executable and the PATH helper in resources", () => {
  expect(config.extraFiles).toContainEqual({ from: "build/bin", to: "bin" });
  expect(config.extraResources).toContainEqual({
    from: "build/update-user-path.ps1",
    to: "update-user-path.ps1",
  });
  const cmd = readFileSync("build/bin/axiom.cmd", "utf8");
  expect(cmd).toMatch(/^@echo off/m);
  expect(cmd).toContain("ELECTRON_NO_ATTACH_CONSOLE=1");
  expect(cmd).toMatch(/start\s+""\s+"%~dp0\.\.\\Axiom\.exe"\s+%\*/i);
  expect(cmd).not.toMatch(/^\s*(?:cd|pushd)\b/im);
  const bash = readFileSync("build/bin/axiom", "utf8");
  expect(bash).toMatch(/^#!\/bin\/sh/);
  expect(bash).toContain("ELECTRON_NO_ATTACH_CONSOLE=1");
  expect(bash).toContain('"$@"');
  expect(bash).toMatch(/>\s*\/dev\/null\s+2>&1\s*&/);
  expect(bash).not.toMatch(/^\s*(?:cd|pushd)\b/im);
});

it("edits PATH in both installer macros without removing it during an update", () => {
  const install = nsh.slice(
    nsh.indexOf("!macro customInstall"),
    nsh.indexOf("!macroend"),
  );
  const uninstall = nsh.slice(nsh.indexOf("!macro customUnInstall"));
  for (const [macro, operation] of [
    [install, "Add"],
    [uninstall, "Remove"],
  ]) {
    expect(macro).toContain("nsExec::Exec");
    expect(macro).toContain("-NoProfile -NonInteractive -ExecutionPolicy Bypass");
    expect(macro).toContain('-File "$INSTDIR\\resources\\update-user-path.ps1"');
    expect(macro).toContain(`-Operation ${operation} -BinPath "$INSTDIR\\bin"`);
    expect(macro).toMatch(/\$0 == 0[\s\S]*SendMessageTimeoutW/);
    expect(macro).toContain('w "Environment"');
  }
  expect(uninstall).toMatch(
    /\$\{ifNot\}\s+\$\{isUpdated\}[\s\S]*-Operation Remove[\s\S]*\$\{endIf\}/i,
  );
  expect(nsh).not.toMatch(/(?:ReadRegStr|WriteReg(?:Str|ExpandStr))[^\n]*"Environment"/i);
});

const windowsTest = it.skipIf(process.platform !== "win32");
const quotePowerShell = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const pathHelper = path.resolve("build/update-user-path.ps1");
type RegistryKind = "ExpandString" | "String" | "DWord";
type RegistryPath = {
  exists: boolean;
  value: string | number | null;
  kind: RegistryKind | null;
};

function powershell(script: string) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from("$ErrorActionPreference = 'Stop'; " + script, "utf16le").toString(
        "base64",
      ),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error("Registry fixture failed: " + result.stderr);
  return result.stdout.trim();
}

function withRegistryPath(
  initial: string | number | undefined,
  kind: RegistryKind,
  check: (fixture: {
    update: (operation: "Add" | "Remove", bin: string) => number | null;
    read: () => RegistryPath;
  }) => void,
) {
  const key = "Software\\AxiomInstallerTests\\" + randomUUID();
  const quotedKey = quotePowerShell(key);
  const value =
    typeof initial === "string" ? quotePowerShell(initial) : String(initial);
  powershell(`
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(${quotedKey});
    try {
      ${initial === undefined ? "" : `$key.SetValue('Path', ${value}, [Microsoft.Win32.RegistryValueKind]::${kind});`}
    } finally { $key.Dispose() }
  `);
  try {
    check({
      update(operation, bin) {
        const result = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            pathHelper,
            "-Operation",
            operation,
            "-BinPath",
            bin,
            "-EnvironmentKey",
            key,
          ],
          { encoding: "utf8", windowsHide: true },
        );
        if (result.error) throw result.error;
        return result.status;
      },
      read() {
        return JSON.parse(
          powershell(`
            $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(${quotedKey});
            try {
              $exists = $key.GetValueNames() -contains 'Path';
              $value = $null;
              $kind = $null;
              if ($exists) {
                $value = $key.GetValue('Path', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);
                $kind = $key.GetValueKind('Path').ToString();
              }
              @{ exists = $exists; value = $value; kind = $kind } | ConvertTo-Json -Compress;
            } finally { $key.Dispose() }
          `),
        ) as RegistryPath;
      },
    });
  } finally {
    powershell(
      `[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree(${quotedKey}, $false);`,
    );
  }
}

windowsTest("preserves a long unexpanded PATH through install, reinstall and uninstall", () => {
  const original = [
    "%LOCALAPPDATA%\\Microsoft\\WindowsApps",
    ...Array.from({ length: 100 }, (_, index) => `C:\\Tools\\tool-${index}\\bin`),
    "",
    '"C:\\Keep these spaces\\"',
    " C:\\Keep this whitespace ",
    "%USERPROFILE%\\last",
  ].join(";");
  const bin = "C:\\Axiom O'Brien & $Tools\\bin";
  expect(original.length).toBeGreaterThan(1024);
  withRegistryPath(original, "ExpandString", ({ update, read }) => {
    expect(update("Add", bin)).toBe(0);
    expect(read()).toEqual({
      exists: true,
      value: original + ";" + bin,
      kind: "ExpandString",
    });
    expect(update("Add", bin)).toBe(0);
    expect(read().value).toBe(original + ";" + bin);
    expect(update("Remove", bin)).toBe(0);
    expect(read()).toEqual({ exists: true, value: original, kind: "ExpandString" });
  });
});

windowsTest("recognizes quoted case variants and removes only matching PATH entries", () => {
  const original =
    'C:\\before;"c:\\Custom App\\BIN\\";C:\\middle; C:\\CUSTOM APP\\bin ;C:\\after';
  withRegistryPath(original, "ExpandString", ({ update, read }) => {
    expect(update("Add", "C:\\Custom App\\bin")).toBe(0);
    expect(read().value).toBe(original);
    expect(update("Remove", "C:\\Custom App\\bin")).toBe(0);
    expect(read()).toEqual({
      exists: true,
      value: "C:\\before;C:\\middle;C:\\after",
      kind: "ExpandString",
    });
  });
});

windowsTest("retains REG_SZ semantics and leaves a PATH without Axiom unchanged", () => {
  const original = "%LITERAL_REFERENCE%\\bin;;C:\\other";
  const bin = "C:\\Axiom\\bin";
  withRegistryPath(original, "String", ({ update, read }) => {
    expect(update("Remove", bin)).toBe(0);
    expect(read()).toEqual({ exists: true, value: original, kind: "String" });
    expect(update("Add", bin)).toBe(0);
    expect(read()).toEqual({
      exists: true,
      value: original + ";" + bin,
      kind: "String",
    });
  });
});

windowsTest("creates an expandable PATH when absent and removes its sole owned entry", () => {
  const bin = "C:\\Axiom\\bin";
  withRegistryPath(undefined, "ExpandString", ({ update, read }) => {
    expect(update("Remove", bin)).toBe(0);
    expect(read()).toEqual({ exists: false, value: null, kind: null });
    expect(update("Add", bin)).toBe(0);
    expect(read()).toEqual({ exists: true, value: bin, kind: "ExpandString" });
    expect(update("Remove", bin)).toBe(0);
    expect(read()).toEqual({ exists: false, value: null, kind: null });
  });
});

windowsTest("rejects an unsupported registry type without replacing its value", () => {
  withRegistryPath(42, "DWord", ({ update, read }) => {
    for (const operation of ["Add", "Remove"] as const) {
      expect(update(operation, "C:\\Axiom\\bin")).toBe(1);
      expect(read()).toEqual({ exists: true, value: 42, kind: "DWord" });
    }
  });
});
