# Issue #42 validation

Validated on Windows on October 2, 2026. The packaged application was built at `2026-10-02T23:57:05.565Z` with Electron 44.3.0 and the repository's required Mutatoc 0.4.0 runtime. The package is unsigned.

## Functional verification

- `npm run typecheck` passed.
- Full Vitest suite: **97 files, 11,629 tests passed**.
- Scanner functional suite: **185 tests passed**, including all 36 rules and 120 combinations of entity kind, identifier form, language and source graph.
- Scanner desktop suite: **10 tests passed** against the development build and **10 passed** against the packaged executable.
- Desktop coverage includes native menu access, read-only scans, exact entity navigation, reviewed label additions, Undo/Redo, stale previews, persistent exceptions, complete JSON/CSV exports, scope/profile settings, detached dark panes, accessibility, pagination, workspace replacement, cancellation and failure states.
- The native Text Analysis regression verifies that Industrial Safety initially has no match, a reviewed label addition makes it match the original exact IRI, and Undo removes that match. No analysis matching code was changed.
- A batch of 137 additions verifies that repairs are not capped at 100 statements, preserve identifiers and existing statements, and undo/redo as one edit.

The full results are in `artifacts/issue-42-full-unit-final.log`, `artifacts/issue-42-unit-final.log`, `artifacts/issue-42-desktop-final.log` and `artifacts/issue-42-packaged-desktop.log`. These generated artifacts are not committed.

## Real ontology and visual verification

The packaged executable opened an isolated copy of `C:\Users\Craig\Desktop\courses.owl` and scanned 5,879 eligible named entities across 23,836 statements. It produced 6,747 findings under the default Axiom profile. Findings are review results, not a count of invalid entities.

`http://devry.edu/courses#Industrial_Safety` received `label.missing`, `description.missing` and `analysis.excluded`. The check completed through the UI in approximately 2.68 seconds. There were no renderer errors, and the Store revision and dirty state were unchanged by scanning.

The original file's SHA-256 before and after was:

```text
e4f06e10547551d84dcd6271f1f0156cb8867c2051db991537f2c1715f8443c8
```

Screenshots of the light docked scanner, dark detached scanner and packaged real-ontology scan were inspected. Evidence: `artifacts/testing/quality-light.png`, `artifacts/testing/quality-dark-detached.png`, `artifacts/issue-42/packaged-courses.png` and `artifacts/issue-42/packaged-real-check.json`.

## Separate performance observations

These are local observations, not functional test assertions or guaranteed timing thresholds. The command is `node --import tsx tests/performance/ontology-quality.ts [ontology-file]`.

| Input              | Eligible entities | Statements | Findings | Snapshot capture | Complete scan | Largest scheduling gap | Cancel request |
| ------------------ | ----------------: | ---------: | -------: | ---------------: | ------------: | ---------------------: | -------------: |
| Generated ontology |            12,001 |     32,002 |   20,001 |           150 ms |        3.43 s |                 109 ms |        0.15 ms |
| courses.owl        |             5,879 |     23,836 |    6,747 |           115 ms |        1.98 s |                  90 ms |        0.14 ms |

Snapshot capture is synchronous; scanning then yields cooperatively on the domain worker. Reported cancellation measures a request after capture. Heap increases were approximately 33 MB and 26 MB; process RSS was approximately 191 MB and 170 MB. Memory measurements include the retained report and a second captured/canceled scan. Data: `artifacts/issue-42-synthetic-performance.json` and `artifacts/issue-42-real-performance.json`.

## Existing menu-suite failures

The broader desktop run produced **29 passed and 11 failed**: all ten scanner tests passed, while the existing 30-test menu suite produced 19 passes and 11 failures. Building and testing an untouched archive of starting commit `2af16e8` reproduced the same eleven menu failures with the same required Mutatoc runtime. These are recorded separately from scanner verification and were not weakened or changed to make this feature pass.

The failing menu cases concern file/title expectations, restoring panes, window focus, query actions, malformed input, detached graph actions, the menu coverage inventory, graph stylesheets, hierarchy renaming, context renaming and relationship editing. Baseline evidence: `artifacts/issue-42-baseline-menus.log`; current evidence: `artifacts/issue-42-desktop-final.log`.

## Deliverables

`npm run package` completed. The rebuilt executable and installer are:

```text
D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe
D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe
```

Package metadata: `artifacts/latest-electron.json`. The unpacked executable was used for all ten packaged desktop tests and the real-ontology check. The scanner workflow, policy and limitations are documented in `docs/ontology-quality.md`.
