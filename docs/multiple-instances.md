# Independent instances

Launch Axiom from its shortcut again, or choose **File > New window**, to open another instance. Each instance takes the lowest free profile slot and restores that slot's last session. Slot 1 remains `%APPDATA%\Axiom`; additional slots use `%APPDATA%\Axiom\instances\2`, `3`, and so on. Existing users need no migration.

Sessions, recovery workspaces, preferences, keyboard shortcuts, recent files, query history, assistant runs, logs and Chromium storage belong to the selected slot. New slots start empty. Use keyboard shortcut import/export when you want to copy bindings explicitly.

Model, Wikipedia and embedding caches remain shared. Clearing a model or Wikipedia cache affects cache hits in every instance, without changing their workspace contents.

## Workspace ownership

A `.axiom` file can be open in one instance at a time. Launching an already-open workspace raises its owner and exits the extra launch. Launching an unopened workspace creates a new instance. File > Open, Recent and Save As also raise the owner when their destination is already in use, leaving the requesting workspace unchanged.

Ownership is reserved before opening or saving, including simultaneous launches and new Save As destinations. It follows normalized Windows paths and filesystem aliases. An OS-owned named pipe provides both the exclusive reservation and the focus signal; Windows releases it if the owner crashes. Probing occupied profile slots never focuses their windows or passes them a file to open.

If a slot's saved session refers to a workspace another instance now owns, the saved snapshot and drafts resume as an unnamed copy. Autosave cannot overwrite the other instance's file. Closing the copy retains it in the slot's recovery workspaces. Recovery files explicitly opened elsewhere receive the same protection.

## Updates

Release checks run independently, while downloads use an exclusive reservation around electron-updater's shared cache. A completed download publishes a small installation-specific handoff record. Before closing, Axiom verifies the staged installer's SHA-512; this also works offline in an instance that did not download it.

After the final workspace save and all windows closing, the process withdraws its active registration. Only the last process for that executable may claim the installer gate and launch the per-user NSIS installer. Concurrent final exits elect one installer. A launch during the installer handoff is asked to retry shortly. Registrations left by terminated processes do not count as active. The installer gate expires after two minutes if its process has ended, or when the executable changes.

The model/Wikipedia/embedding caches and the small instance/update coordination records are the only deliberately shared application state. Workspace editing state remains in its slot. Update failures leave the staged files available for a later launch.

## Development and verification

`AXIOM_USER_DATA` pins one exact profile and retains the previous single-profile handoff used by desktop tests. `AXIOM_INSTANCE_ROOT` supplies a disposable root while exercising normal slot selection. File > New window explicitly chooses another slot in that profile family.

Set `AXIOM_DISABLE_UPDATES=1` when testing a packaged build to prevent release checks or installer launch. The multi-instance desktop suite sets this explicitly.

The multi-instance desktop suite starts real Electron processes and checks isolation, autosave and restart, silent probes, launch routing, Open/Recent/Save As conflicts, contested session restoration, forced-exit recovery and the New window command. Unit tests cover slot selection, ownership races and aliases, installer election, checksum validation and offline handoff.

```powershell
npx vitest run tests/domain/instance-profile.test.ts tests/domain/workspace-ownership.test.ts tests/domain/instance-registry.test.ts tests/domain/updates.test.ts
npm run build
npx playwright test tests/e2e/multi-instance.spec.ts tests/e2e/launch-file.spec.ts tests/e2e/session-startup.spec.ts tests/e2e/workspace-autosave.spec.ts
```

Installer tests intercept process launch; they never install a release or stop another installed application.
