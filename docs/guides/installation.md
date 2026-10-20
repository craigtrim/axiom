# Installing Axiom on Windows

`npm run package` produces `Axiom-Setup-<version>.exe` under `artifacts/installer/`.
Running it installs Axiom for the current account, so no administrator prompt appears
at any point.

## Build a new executable yourself

Run D:\git\axiom\Build-Axiom-EXE.ps1 from PowerShell. The local launcher is ignored
by Git and calls the shared build helper. On any checkout with dependencies installed,
the equivalent command is:

```powershell
cd D:\git\axiom
npm run build:exe
```

Use Node.js 22.12 or later. On a fresh checkout, first run `npm ci` and
`npm run setup:mutatoc -- <extracted-mutatoc-0.6.0-folder>` to install dependencies
and the native runtime. Those are already set up in Craig's current checkout.
Close any Axiom copy running from `artifacts\installer\win-unpacked` before
rebuilding it. The helper builds the current files, including local edits.

The helper checks the native runtime and TypeScript, builds the application and
installer, and runs six desktop checks using separate test profiles. These cover
literal Find synonyms, editing highlighted text with automatic analysis on and off,
updates across panes, search without a local model, and autosave recovery after a
forced exit. If the local MPNet model is installed, it also runs two semantic-search
checks. It then compares the packaged files with the build output, checks the native
runtime and licenses, and records SHA-256 hashes for the executable and installer.
This is a focused package check; `npm run verify` remains the broader test command.

Logs, desktop results and `receipt.json` are retained in a timestamped folder under
`artifacts\build-exe`. A failed step stops the process, prints `BUILD FAILED` and the
log path, and returns a nonzero exit code. A build is ready when `BUILD VERIFIED`
appears. Packaging can take several minutes; progress messages show the active log.
The helper does not publish a GitHub release or run the installer.

With the current version, the outputs are:

Application: D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe

Installer: D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe

Keep the entire `win-unpacked` folder together when using the application directly.
The installer is the single file to use when installing or sharing a build.

Builds require the complete Mutatoc 0.6.0 Windows package for Text Analysis (craigtrim/axiom#137). See [runtime setup](text-analysis.md#runtime) for the verified package and installation command.

## What the installer does

It installs into `%LOCALAPPDATA%\Programs\Axiom`, with the destination offered on an
installation page you can change. It adds a Start menu shortcut, a desktop shortcut and
an entry in Apps and features, and it registers the `.axiom` file type so double-clicking
a workspace opens it.

Registration writes an `Axiom.Workspace` ProgID under `HKEY_CURRENT_USER\Software\Classes`,
carrying the icon and a `shell\open\command` that passes the file path to `Axiom.exe`,
and points `.axiom` at that ProgID. Microsoft documents this per-user branch as the
registration that needs no elevation, which is why the installer uses it rather than the
machine-wide branch. `build/installer.nsh` holds those keys, because electron-builder
emits its own file associations only for an installer that installs for every account
and therefore prompts for elevation.

Uninstalling removes the application, the shortcuts and the ProgID. It deliberately
leaves the Default value of the `.axiom` key in place: another application may have
taken the type over in the meantime, and Windows ignores a Default value naming a ProgID
that is no longer registered.

## Updates

Axiom checks GitHub Releases at startup, downloads a newer version in the background and
installs it after the last instance from that installation closes. Quitting one window
keeps the other instances running. The completed download is shared, so the last instance
can install it even if the instance that downloaded it has already exited. A check
that fails, which usually means no network rather than a defect, is logged to the console
and otherwise ignored.

Each plain launch opens an independent instance. Double-clicking a workspace already
open raises its owning window; an unopened workspace starts in a free instance slot.
See [Independent instances](multiple-instances.md) for profiles and file ownership.

## Signing

Builds are unsigned today, so Windows SmartScreen warns the first time you run the
installer. The signing configuration is already in `config/electron-builder.config.cjs` and
turns on when the build environment carries these variables:

| Variable                          | Meaning                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `AXIOM_AZURE_SIGNING_ENDPOINT`    | The signing account endpoint for its region. Setting this is what enables signing. |
| `AXIOM_AZURE_SIGNING_ACCOUNT`     | The signing account name.                                                          |
| `AXIOM_AZURE_CERTIFICATE_PROFILE` | The certificate profile name.                                                      |
| `AXIOM_AZURE_PUBLISHER_NAME`      | The publisher name as it appears on the certificate. Defaults to Craig Trim.       |

Authentication to Microsoft Entra ID comes from the environment, through the variables
Azure's own tooling reads, so no credential is stored in the repository.

## Running from source

A development checkout needs none of this. `npm start` runs the application directly, and
a launch path still works when passed on the command line:

```powershell
npm run build
npx electron . D:\work\Ontology.axiom
```

The file type is not registered in that case, because registration belongs to the
installer. To associate `.axiom` with a build you are running from source, install once
from `artifacts/installer/` and let the installed copy own the association.

## macOS and Linux

Neither is packaged today. macOS declares file types through `CFBundleDocumentTypes` in
Info.plist, and the path reaches Axiom through the `open-file` event rather than the
command line. Linux needs a `.desktop` entry carrying
`MimeType=application/x-axiom-workspace`, alongside a shared-mime-info XML file mapping
the extension to that media type.
