# Archived WinUI implementation

The active application is Electron and TypeScript. The former WinUI, Win2D and .NET implementation is preserved in `axiom-winui-20260912.zip`. That archive is kept locally and excluded from version control, so a fresh clone does not contain it.

The archive contains 102 authored files, including the original projects, tests, build scripts, documentation and workflow definitions. [winui-manifest.json](winui-manifest.json) is committed and records each file's SHA-256 hash and the archive hash, so a retained copy can be verified against this repository. Every archive entry was verified before the active native directories and build outputs were removed.

Generated bin/obj files, downloaded tooling and obsolete executable packages are excluded. Restore the archive into a separate directory if the historical implementation is needed. It is not part of the active build.
