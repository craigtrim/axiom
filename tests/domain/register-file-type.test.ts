// craigtrim/axiom#2
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
const run = promisify(execFile);
const windows = process.platform === "win32";
const script = path.resolve("scripts/register-file-type.ps1");
// Every run owns a scratch class root, so a real .axiom association is never touched.
const root = "HKCU:\\Software\\Axiom-Test-" + randomUUID() + "\\Classes";
const directories: string[] = [];
async function powershell(...args: string[]) {
  const { stdout } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
    { windowsHide: true },
  );
  return stdout.trim();
}
const registration = (...script: string[]) =>
  powershell("-Command", script.join("; "));
async function install() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "axiom-install-"));
  directories.push(directory);
  await writeFile(path.join(directory, "Axiom.exe"), "binary stand-in");
  return directory;
}
afterEach(async () => {
  if (windows)
    await registration(
      `$key = '${root.replace(/\\Classes$/, "")}'`,
      "if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse -Force }",
    ).catch(() => undefined);
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined,
    );
});

it.runIf(windows)(
  "points the .axiom command and icon at the installed executable",
  async () => {
    const directory = await install();
    const output = await powershell(
      "-File",
      script,
      "-InstallDirectory",
      directory,
      "-RegistryRoot",
      root,
    );
    expect(output).toContain("Axiom.exe");
    const executable = path.join(directory, "Axiom.exe");
    expect(
      await registration(
        `(Get-ItemProperty -LiteralPath '${root}\\Axiom.Workspace\\shell\\open\\command').'(default)'`,
      ),
    ).toBe(`"${executable}" "%1"`);
    expect(
      await registration(
        `(Get-ItemProperty -LiteralPath '${root}\\Axiom.Workspace\\DefaultIcon').'(default)'`,
      ),
    ).toBe(`"${executable}",0`);
    expect(
      await registration(
        `(Get-ItemProperty -LiteralPath '${root}\\.axiom').'(default)'`,
      ),
    ).toBe("Axiom.Workspace");
    expect(
      await registration(
        `(Get-ItemProperty -LiteralPath '${root}\\.axiom').'Content Type'`,
      ),
    ).toBe("application/x-axiom-workspace");
  },
  60000,
);

it.runIf(windows)(
  "repoints the command when Axiom moves to another directory",
  async () => {
    const first = await install();
    const second = await install();
    for (const directory of [first, second])
      await powershell(
        "-File",
        script,
        "-InstallDirectory",
        directory,
        "-RegistryRoot",
        root,
      );
    expect(
      await registration(
        `(Get-ItemProperty -LiteralPath '${root}\\Axiom.Workspace\\shell\\open\\command').'(default)'`,
      ),
    ).toBe(`"${path.join(second, "Axiom.exe")}" "%1"`);
  },
  60000,
);

it.runIf(windows)(
  "removes every key it created",
  async () => {
    const directory = await install();
    await powershell(
      "-File",
      script,
      "-InstallDirectory",
      directory,
      "-RegistryRoot",
      root,
    );
    await powershell("-File", script, "-Remove", "-RegistryRoot", root);
    expect(
      await registration(
        `Test-Path -LiteralPath '${root}\\Axiom.Workspace'`,
        `Test-Path -LiteralPath '${root}\\.axiom'`,
      ),
    ).toBe("False\nFalse".replace("\n", os.EOL));
  },
  60000,
);

it.runIf(windows)(
  "removing an association that was never created succeeds",
  async () => {
    await expect(
      powershell("-File", script, "-Remove", "-RegistryRoot", root),
    ).resolves.toContain("Removed");
  },
  60000,
);

it.runIf(windows)(
  "refuses a directory with no Axiom.exe and writes nothing",
  async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "axiom-empty-"));
    directories.push(empty);
    await expect(
      powershell(
        "-File",
        script,
        "-InstallDirectory",
        empty,
        "-RegistryRoot",
        root,
      ),
    ).rejects.toThrow(/No Axiom.exe/);
    expect(await registration(`Test-Path -LiteralPath '${root}\\.axiom'`)).toBe(
      "False",
    );
  },
  60000,
);

it.runIf(windows)(
  "refuses a directory that does not exist",
  async () => {
    await expect(
      powershell(
        "-File",
        script,
        "-InstallDirectory",
        path.join(os.tmpdir(), "axiom-absent-" + randomUUID()),
        "-RegistryRoot",
        root,
      ),
    ).rejects.toThrow();
  },
  60000,
);

it.runIf(windows)(
  "refuses to register without an install directory",
  async () => {
    await expect(
      powershell("-File", script, "-RegistryRoot", root),
    ).rejects.toThrow(/-InstallDirectory/);
  },
  60000,
);
