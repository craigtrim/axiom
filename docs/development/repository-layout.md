# Repository layout

The root contains the package manifests, README, TypeScript configuration, dotfiles
and the local PowerShell launcher. Test-runner and Electron Builder configuration
live in `config`; license notices live in `licenses`. The npm commands select their
configuration explicitly, and test/report paths resolve from the repository root.

| Location                                               | Purpose                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `src/domain`, `src/main`, `src/renderer`, `src/shared` | Application code and process boundaries                    |
| `tests/domain`, `tests/e2e`, `tests/performance`       | Automated checks and benchmarks                            |
| `tests/fixtures`, `tests/conformance`                  | Reference material; preserve published bytes and checksums |
| `docs/guides`                                          | Installation and application behavior                      |
| `docs/development`                                     | Architecture, testing and maintenance                      |
| `docs/validation`                                      | Historical issue validation and audits                     |
| `scripts`                                              | Shared build, setup, test and maintenance commands         |
| `config`                                               | Electron Builder, Vitest and Playwright configuration      |
| `assets`, `build`, `licenses`                          | Icons, installer resources and dependency licenses         |
| `vendor/mutatoc`                                       | Installed native runtime; ignored by Git                   |
| `archive`                                              | Manifest and notes for the retired WinUI application       |
| `local`                                                | Private notes and scratch files; ignored by Git            |

## Build entry points

`npm run build:exe` downloads and verifies the executable tested by hosted CI.
Craig's ignored root launcher, D:\git\axiom\Build-Axiom-EXE.ps1, invokes the same
helper. `npm run package` remains the packaging-only command. See
[installation](../guides/installation.md) and the [script index](../../scripts/README.md).

The files `licenses/LICENSES.md` and `licenses/THIRD-PARTY-NOTICES.txt` are
packaging inputs. The build copies them under their original names into the
application, and the hosted package checks verify them. The `build` directory holds
installer source resources; `dist` holds generated application files.

## Generated output

| Location under `artifacts`                     | Contents                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `installer`                                    | Current installer and unpacked application; keep these paths stable  |
| `latest-electron.json`                         | Metadata locating the current application and installer              |
| `build-exe`                                    | Current delivery receipt, lock and temporary artifact downloads      |
| `packaged`                                     | Hosted packaged-test inventory, results, logs and failure traces     |
| `reports`                                      | Focused search, SPARQL and opt-in live-test JSON results             |
| `catalogs`                                     | Generated search-query catalog                                       |
| `benchmarks`                                   | Domain, desktop, graph and native text-analysis measurements         |
| `playwright-report`, `test-results`, `testing` | Current desktop reports, traces and isolated profiles                |
| `history/2026-10-20`                           | Archived loose files and historical run directories from the cleanup |
| `repository-cleanup/2026-10-20`                | Before-files, move manifest and cleanup verification                 |

Some tests retain their established issue-specific output directories. Check their
references before relocating those directories. New reports should use a named
subdirectory or a timestamped run directory rather than accumulating at the
`artifacts` root. Generated files remain ignored by Git.

The archive retains the original entry names and contents. Its `move-manifest.json`
maps old paths to new ones. Current build paths, named output paths used by existing
tools, and files modified on the cleanup date were retained. Nothing was discarded.
The root note `things-i-need` is now `local/notes/things-i-need.txt`.

## Test commands

Use `npm test` for domain tests and `npm run test:desktop` for desktop tests.
Append `-- <test-file-or-options>` to target a subset. The opt-in assistant tests
still use `npm run test:codex`; their separate config keeps the opt-in guard.
Direct Vitest or Playwright invocations need `--config config/vitest.config.ts`
or `--config config/playwright.config.ts` respectively.

## Maintaining references

Run `npm run check:docs` after moving documentation. Update imports, config paths
and script references in the same change as any code move. Several scripts calculate
the repository root from their directory, so moving a script also requires checking
that calculation.

Published reference fixtures retain their original text, including historical
document citations. Maintained fixture READMEs use the current npm test commands. Find those documents by their original filename in the
[documentation index](../README.md). Application source and test fixtures were not
reorganized as part of the documentation/output cleanup.
