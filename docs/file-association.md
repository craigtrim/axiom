# Opening .axiom files from the desktop

Axiom opens a workspace or ontology handed to it at launch. Making a double-click in
Explorer reach Axiom takes one more step, because the operating system decides which
application owns an extension, and nothing in the build registers that on its own.

## Install to a stable directory first

`scripts/package.mjs` writes its output to `artifacts/electron-<timestamp>/`, and that
timestamp changes with every build. An association pointing into that directory breaks
as soon as the next build runs, so copy the packaged application somewhere permanent
before registering it:

```powershell
$build = (Get-Content artifacts/latest-electron.json | ConvertFrom-Json).directory
Copy-Item -Path $build -Destination "$env:LOCALAPPDATA\Programs\Axiom" -Recurse -Force
```

`C:\Program Files\Axiom` works too and needs an elevated prompt for the copy. The
registration itself never needs one.

## Register the extension

```powershell
pwsh -File scripts/register-file-type.ps1 -InstallDirectory "$env:LOCALAPPDATA\Programs\Axiom"
```

The script writes an `Axiom.Workspace` ProgID under `HKCU\Software\Classes`, pointing
its `shell\open\command` and `DefaultIcon` at `Axiom.exe`, and sets `.axiom` to that
ProgID. Per-user registration needs no administrator rights and affects only the signed
in account. No other application claims `.axiom`, so Windows opens the file rather than
first asking which program to use.

Run the script again after moving or reinstalling Axiom. It rewrites the entries rather
than leaving a command line pointing at a directory that has gone. It refuses a
directory with no `Axiom.exe` in it, so a mistyped path fails before anything is
written.

To undo it:

```powershell
pwsh -File scripts/register-file-type.ps1 -Remove
```

Explorer caches file types, so the script notifies the shell once it finishes. The
association works immediately either way; only the icon may lag until the next sign-in.

## What a double-click does

Windows starts `Axiom.exe` with the file path as its argument. Axiom reads that path,
and a `.axiom` file opens as a workspace while an ontology file is imported. When Axiom
is already running, the second launch hands its path to the running copy and exits,
which keeps one Axiom per profile rather than two competing for the same session file.

## macOS and Linux

`scripts/package.mjs` targets Windows only, so neither is registered today. When those
packaging targets arrive:

macOS declares the type in `CFBundleDocumentTypes`, which `@electron/packager` writes
from its `extendInfo` option. LaunchServices registers the declaration when the bundle
runs from `/Applications`, and the path reaches Axiom through the `open-file` event
rather than through the command line.

Linux needs a `.desktop` entry carrying `MimeType=application/x-axiom-workspace`, and a
shared-mime-info XML file mapping the `.axiom` extension to that media type. The path
arrives in the command line as it does on Windows.
