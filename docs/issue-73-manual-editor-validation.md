# Manual Text Analysis validation

Issue #73 was reopened because editing remained laggy with Live analysis off. The revised mode keeps typing in Monaco, captures text after a pause or before a workspace action, removes analysis decorations and click navigation, and leaves the hidden Summary unmounted. Analyze now is the explicit parser entry point while manual mode is active. Ontology changes and reopening no longer trigger matching.

The desktop checks also exposed a missing Monaco contribution: Ctrl+Shift+Arrow changed the hidden textarea selection without updating Monaco's selection. Loading the word-operations contribution restores word selection and deletion. The acceptance checks cover keyboard selection, ordinary clicks, native clipboard paste, drag selection, undo/redo, explicit analysis, stale replies, graph actions, and persistence through close and restart.

## Measurements

Measurements were taken on October 16, 2026, on Windows 10.0.19045 with an AMD Ryzen Threadripper 3960X, 48 logical processors, and 127.9 GiB RAM. Both applications were packaged Electron 44.3.0 builds with Mutatoc 0.5.1. The previous installer contained the first #73 implementation and the existing local work. The revised installer contains that local work plus the new manual mode.

Each run uses real keyboard events, native clipboard paste, and an isolated profile. It samples 120 typed characters and 120 deletions. The timing starts in a capturing keydown listener and ends in the second animation-frame callback, providing a conservative approximation of the next paint opportunity. It is not a hardware measurement of display latency. Paste and selection values include Playwright round-trip overhead and are individual operations.

The plain reference is a separate Monaco editor in the same application with equivalent size, wrapping, font, and editor options, without analysis subscribers. The benchmark clears the graph and reduces motion to isolate text editing. It does not measure editing alongside an actively animating graph.

| Workload                                         | Build and editor               | Typing p50 / p95 / p99 / max (ms) | Deletion p50 / p95 / p99 / max (ms) |
| ------------------------------------------------ | ------------------------------ | --------------------------------- | ----------------------------------- |
| 10,000 characters, 50 concepts, 1,000 matches    | Previous manual mode           | 30.6 / 31.3 / 31.7 / 33.4         | 30.8 / 31.2 / 31.4 / 35.3           |
| Same small workload                              | Revised manual mode            | 30.7 / 31.1 / 31.2 / 33.0         | 30.7 / 31.2 / 31.3 / 31.3           |
| Same small workload                              | Plain reference in revised app | 30.8 / 31.2 / 31.5 / 37.5         | 30.8 / 31.2 / 31.3 / 31.4           |
| 98,000 characters, 2,000 concepts, 9,800 matches | Previous manual mode           | 28.1 / 30.5 / 32.6 / 47.2         | 28.1 / 30.1 / 33.3 / 57.4           |
| Same large workload                              | Revised manual mode            | 28.2 / 29.1 / 29.2 / 29.2         | 28.4 / 29.2 / 29.3 / 36.2           |
| Same large workload                              | Plain reference in revised app | 28.9 / 29.4 / 29.7 / 39.7         | 28.9 / 29.4 / 29.5 / 29.6           |

The large document has 1,226 lines; the small document has 121. Both revised cases meet the issue's proposed p95 limit of 50 ms and p99 limit of 100 ms. No parse requests, hidden Summary DOM mutations, or main-thread long tasks of at least 50 ms were recorded during the typing samples. Unit tests separately verify that a burst of manual edits does not read the whole text and produces only the initial invalidation notification until capture.

For the large workload, the measured paste operation took 96.0 ms in the previous application and 85.0 ms in the revised application. Select-all took 80.0 ms and 49.3 ms respectively. The revised application's plain reference measured 97.1 ms for paste and 51.2 ms for selection. These single operations are descriptive, not percentile estimates.

The synthetic keyboard runs did not reproduce Craig's severe reported lag. They establish that the revised manual editor performs close to the plain reference for these workloads. The code changes remove confirmed work from manual editing, including the retained-match scan on ordinary clicks, but the measurements do not establish a single cause for Craig's original session.

Early attempts to inject an entire long passage with Chromium's bulk InsertText command stalled. The recorded comparisons use native clipboard paste, which exercises the user-facing operation and completed successfully. The incomplete bulk-injection attempts are excluded from the results.

## Validation and artifacts

The combined checkout passed type checking and all 12,085 unit tests. All 49 packaged JavaScript, CSS, HTML, and JSON build files match their build inputs. Packaging verified the native runtime's 28 manifested files. The build source commit is `64a9255303d59344173dc436298cc9088b3c62a4`, which combines implementation commit `8d82e0255f1ec9e6233860234fdc30a64f3e1cd8` with the pre-existing local work.

The installer is D:\git\axiom\artifacts\build-73-manual-20261016\Axiom-Setup-1.0.0.exe. Its SHA-256 is `1a40e77f29c6b1ab24685f96fcf9638737670c810723f6ee63c6e5b5de103425` and its size is 208,772,330 bytes. No installer was executed against Craig's installation.

The benchmark is `scripts/benchmark-text-editor.mjs`. Set `AXIOM_TEST_EXE` to the packaged executable and run `node scripts/benchmark-text-editor.mjs <run-name>`. Optional `AXIOM_BENCH_CONCEPTS`, `AXIOM_BENCH_CHARACTERS`, and `AXIOM_BENCH_SAMPLES` variables control the workload. Defaults are 2,000 concepts, 98,000 characters, and 240 alternating input operations. Reports and CPU profiles are written under `artifacts/manual-editor/<run-name>`.

The retained delivery evidence is under D:\git\axiom\artifacts\issue-73-manual-20261016. It includes the four before/after reports and CPU profiles, package receipt, unit results, and the packaged Text Analysis desktop log.
