# Installing Axiom on Windows

`npm run package` produces `Axiom-Setup-<version>.exe` under `artifacts/installer/`.
Running it installs Axiom for the current account, so no administrator prompt appears
at any point.

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
installs it when you next quit, so an update never interrupts an editing session. A check
that fails, which usually means no network rather than a defect, is logged to the console
and otherwise ignored.

## Signing

Builds are unsigned today, so Windows SmartScreen warns the first time you run the
installer. The signing configuration is already in `electron-builder.config.cjs` and
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
