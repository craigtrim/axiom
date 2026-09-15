# Electron verification

The Electron application is the sole active application. This record separates observed checks from release acceptance work that remains unverified.

## Source editor and linked files, 14 September 2026

The source and file-preview implementation passed TypeScript checking and the full domain run of 1,865 tests. Fourteen domain checks specifically cover source round trips, synchronized edits, invalid/conflicting input and thumbnail caching. The development build also passed lifecycle checks for all 29 bundled ontologies and Windows metadata collection. Menu regressions verified opening and closing Source, native command coverage, query cancellation and editor Undo behavior.

All six Source and linked-file acceptance journeys passed against the portable executable below. They cover edits in both directions, six-format switching, invalid and conflicting drafts, workspace Save from a closed Source pane, reopening, file-open/folder-reveal dispatch, native thumbnail creation, and Source Undo/Redo/Find. Shell opening was intercepted; the thumbnail used an actual synthetic PNG. The complete desktop suite was not rerun against this package.

```text
D:\git\axiom\artifacts\electron-20260914T233732Z\Axiom-win32-x64\Axiom.exe
```

[Source and file delivery verification](../artifacts/testing/source-files-delivery-verification.json) records package hashes and coverage. [Packaged test results](../artifacts/testing/source-files-packaged-results.json) retain the six results. [Source editing and linked files](source-and-files.md) describes apply semantics, supported RDF formats, OWL syntax limits and preview caching.

## SPARQL engine and real Codex integration, 14 September 2026

The Comunica query build passed TypeScript checking and all 1,837 normal domain tests. Its dedicated local SPARQL suite passed all 1,642 checks, with no expected-failure exceptions. The coverage inventory includes every W3C manifest entry and identifies the remote HTTP and entailment cases outside local scope.

All twelve opt-in real-Codex cases passed against the packaged executable using codex-cli 0.154.0 on PATH. They include the reported American prefix request and verify actual query results. No provider was mocked or skipped. The suite is excluded from ordinary testing and runs only through `npm run test:codex`.

Sixteen packaged desktop regressions passed, covering query forms, result cells, formatting, composer review, dataset refresh, detached panes, menu actions and cancellation with 100,000 generated orders. The full unrelated desktop suite was not repeated for this update.

The [delivery verification record](../artifacts/testing/sparql-delivery-verification.json) records the executable path and package hashes. [SPARQL testing](sparql-testing.md) documents the offline corpus, live-test commands and execution boundaries. The observations below also retain evidence from earlier builds.

## Reproduce

Use Node.js 22.12 or later on Windows:

```powershell
npm ci
npm run verify
npm run package
$env:AXIOM_TEST_EXE=(Get-Content artifacts/latest-electron.json | ConvertFrom-Json).executable
npx playwright test
```

The earlier hover/focus build passes TypeScript strict checking and five existing desktop journeys covering graph popups, keyboard context menus, native Alt/F10, palette behavior and pane navigation. Focused interaction checks also passed for shared hover colors, disabled entries, pointer/keyboard agreement, search hover followed by Enter, light/dark/high-contrast themes and detached windows. [Hover verification](../artifacts/testing/hover-interaction-checks.json) records the EXE, hashes, observations and screenshots.

The preceding graph-callout build passed all 151 domain tests across ten files and all 11 authoring/export desktop journeys. [Graph callout verification](../artifacts/testing/graph-callout-verification.json) retains those results. The complete domain and desktop suites were not repeated for this hover/focus update.

The earlier desktop inventory contained 89 journeys. The prior build had all 85 journeys verified: 84 passed in its full run, and the pane-focus journey passed unchanged in isolation after a Windows foreground-focus failure. Its runtime dependency audit reported zero known vulnerabilities. [Prior delivery verification](../artifacts/testing/authoring-provenance-delivery-verification.json) retains those results. Broader coverage and performance observations below include that earlier build; the complete desktop suite was not repeated for the current update.

Desktop tests launch Electron with isolated user-data directories. Most menu tests invoke native Electron menu callbacks and assert the resulting behavior. Open/Save dialog selections and About responses are controlled by tests; an OS accessibility driver does not operate those dialogs. Native Alt/F10 tests send Windows keystrokes only after checking the exact test window is foreground, and check focus before each send.

All 101 actionable native menu entries have assigned outcome tests. The inventory fails when a command lacks a test assignment. [Menu coverage](../artifacts/testing/native-menu-coverage.json) records the mapping across File, Edit, View, Graph, Query, Research, Window and Help.

## Authoring and exports

Context menus, command lists, search results, hierarchy rows, pane popup menus and table rows use shared hover colors. Pressed actions have a separate state. Pointer movement moves context-menu focus so the next arrow key continues from that item; disabled actions do not gain hover or focus styling. Search hover updates the result that Enter will open without taking focus from the search box. Keyboard shortcut selection remains unchanged by hovering its command list.

New instance opens beside the class chosen from the graph context menu. A connector follows the source node, and unrelated nodes, labels and edges fade while the source keeps its color. The popup moves around pane edges and follows changes to the displayed parent class. Escape, the close button, Cancel and clicking outside dismiss it. Detached-window behavior, pane resizing, blank-canvas placement and node-budget refusal were covered by the graph-callout build's desktop checks. Pixel comparisons verify source-color preservation and fading of other nodes; populated light and dark views were also reviewed.

Desktop checks cover taxonomy inline creation with natural labels, graph creation of classes and instances at the clicked position, context menus, keyboard creation and rename, taxonomy dragging onto the Inspector, full entity document tabs, retained drafts from closed tabs, conflicting changes, and workspace Save. Identifier changes retain the editor and pinned graph position and update incoming instance references. Generated sample records expose their read-only status.

The graph retains its configurable 100 to 3,000 node cap, with 1,000 as the initial value. Tests verify refusal at a full graph cannot partially create an ontology entity, and old-workspace creation requests are rejected. Domain coverage includes a seeded 10,000-operation viewport exercise, protected nodes, layouts and held-back accounting.

Export checks generate actual PNG, JPEG, WebP, SVG, PDF, TIFF and BMP files and validate their encodings. Clipboard export is exercised. Reports produce multi-page PDF, HTML, Markdown, CSV and JSON. Tests cover named graphs, language tags and complete structured statements, plus Markdown escaping. The entity editor, export dialog and provenance pane were visually reviewed. PDF validity and pagination were checked programmatically; every possible page geometry and content length was not visually certified.

The [Microsoft UX research](../specs/electron/authoring-export-provenance-research.md) explains the Visio and Class Designer precedents, Axiom-specific decisions and tradeoffs.

## Published ontology corpus

Twenty-nine source ontologies are retained with URLs, retrieval metadata and SHA-256 hashes in [the corpus manifest](../tests/fixtures/ontologies/manifest.json). They include RDF, RDFS, OWL, PROV, SKOS, SHACL, DCAT, Schema.org, FOAF, GoodRelations and other established vocabularies. Source files include Turtle and RDF/XML, including .owl documents.

Every vocabulary has domain and desktop import, bounded graph view, label edit, class creation, workspace save, close and reopen coverage. The domain suite also checks RDF round trips. Additional syntax fixtures cover N-Triples, N-Quads, TriG and JSON-LD, blank nodes, datatypes, language tags, named graphs and rejection of external entities. These are part of the standard test commands and run without downloading data again.

Passing this corpus establishes compatibility with those files and operations. It does not establish OWL reasoning, complete SPARQL support or acceptance of every possible RDF serialization.

## Filesystem provenance

The packaged EXE collected a known Windows directory tree containing a nested file and a Zone.Identifier alternate stream. Assertions checked native file information, more than 15 Windows property-store entries, the owner SID, alternate-stream metadata and hashes, embedded-reader output, raw evidence, PROV RDF, and workspace save/close/reopen. The original content hash was unchanged.

The bundled Windows helper compiles and runs from the unpacked metadata directory. It attempts file information, property-store keys, version and signature information, security descriptors and audit ACLs, alternate streams, file and volume IDs, object IDs, reparse records, extended attributes, compression, integrity, allocation records, hard-link names, encryption status and existing change-journal access. ExifTool collects grouped, duplicate, unknown and embedded tags. Returned errors and partial results remain in the evidence.

Journal access was denied under the tested account. The collector retained that result; historical journal recovery was not verified on this host. Collection does not manufacture historical creators or activities from ownership fields or timestamps. The observed scan activity and metadata observations are distinguished from the source files.

Reparse targets are not traversed. Offline content requires an explicit option. Timeouts, entry limits, cancellation and reader-size limits are recorded. A raw collection may exceed the in-memory ontology import capacity; raw evidence and RDF remain available. Encrypted volumes, remote shares, cloud hydration, every property handler and every embedded document type have not been certified.

## Keyboard and inline rename

Twenty-nine keyboard domain tests cover menu-letter uniqueness, the command inventory, canonical syntax, overlapping scopes, duplicate and prefix conflicts, reserved combinations, AltGr/IME handling, import validation and chord behavior. Six desktop journeys cover remapping, alternate bindings, chords, menu letters, import/export, restart persistence, detached panes, focus restoration, current help and pane navigation. All six passed on the packaged EXE, including default Alt+E, K and F10, E, K paths and the remapped Alt+A, N path.

Rename tests cover hierarchy rows, graph labels, property names, individual cells and a detached Inspector. They check Enter, Escape, blur-save, validation, focus restoration, Undo/Redo and old-workspace rejection. Rename listeners attach before paint, and commands require acknowledgement from the target editor.

An axe scan checks the dark workbench for serious and critical issues. Theme tests also cover light and high contrast; light is the default for a new profile. This is narrower than the full Windows assistive-technology and international-keyboard matrix.

## Performance evidence

Measurements were taken on an AMD Ryzen Threadripper 3960X with approximately 128 GB RAM and an NVIDIA RTX 4090. This is above the provisional minimum configuration. The host reports Windows 10; clean Windows 11 deployment and minimum-hardware performance remain external checks.

Raw reports are generated at [domain.json](../artifacts/benchmarks/domain.json) and [desktop.json](../artifacts/benchmarks/desktop.json). The domain harness uses a warmup and five or seven measured samples. Its values below are p95 unless stated otherwise.

| Operation | Observed |
| --- | ---: |
| Generate 100,000 orders and indexes | 164 ms |
| Margherita adjacency at 100,000 orders | 7.1 ms |
| Customer adjacency at 100,000 orders | 11.1 ms |
| Filter 100,000 rows | 59 ms |
| Sort 100,000 rows by price | 38 ms |
| Worked query 1, all fixture sizes | below 1 ms |
| Worked query 4, 100,000 orders | 292 ms |
| Worked query 5, 100,000 orders | 425 ms |
| Hierarchy / radial / grid, 3,000 nodes | 33 / 17 / 6 ms |
| Fresh force layout, 3,000 nodes, 240 ticks | 2,531 ms |

The domain query measurements exclude IPC and snapshot construction. They do not establish the full submission-to-result budgets. Fresh force settling exceeds the original 2,000 ms target on this measurement.

The desktop harness records 600 actual graph draw events per workload. It applies repeated small zoom transforms to keep drawing active, and separately records draw submission time and the interval between completed draws. It is a diagnostic workload, not an external compositor trace or the exact slow-pan procedure specified by PB-01.

The earlier rewrite package produced the measurements below. Those complete benchmark workloads have not been repeated for the current package. The current styled-graph diagnostic is reported separately below.

| Desktop operation | Observed |
| --- | ---: |
| Startup to graph ready | 918 ms |
| Regenerate 100,000 orders to updated UI | 247 ms |
| 1,000-node force, draw submission p95 / p99 | 3.8 / 4.0 ms |
| 3,000-node force, draw submission p95 / p99 | 9.5 / 11.2 ms |
| 3,000-node grid, draw submission p95 / p99 | 9.4 / 10.4 ms |
| 3,000-node force, frame interval p95 / p99 | 17.4 / 18.3 ms |
| 3,000-node grid, frame interval p95 / p99 | 17.4 / 18.1 ms |
| Aggregate working set after renderer collection | 448 MB |

The display limit is enforced independently of fixture size. The initial limit of 1,000 is retained as a starting point, not as a claim that every 1,000-node view is readable. Users can select a smaller limit without discarding data from the Store.

## Checklist verification

The new domain checks cover CSS validation and cascading, circular layout, history limits, bounded contextual prompts, full-batch suggestion validation, annotation and individual creation, PATH discovery, structured subprocess responses and cancellation. Both CLI adapters are exercised with controlled subprocesses. The packaged app separately detects the installed Codex and Claude commands; [assistant detection](../artifacts/testing/installed-assistants.json) records that check. Those earlier checklist checks only detected providers. The current live query-generation checks are recorded separately below.

Desktop checks cover all added menu entries, ELK completion and cancellation, pinned coordinates, stylesheet validation and export, workspace and restart persistence, taxonomy double-click and context menus, research review, stale-batch rejection, real pointer and camera Undo, manual arrangement preservation and automatic widescreen switching. The research UI journey uses a controlled provider response; the subprocess adapters are tested separately.

On the current packaged executable, the 3,000-node styled-graph diagnostic completed a hierarchy edit during ELK work in 106 ms. Across 120 warmed draw events, draw submission p95 was 22.1 ms. This exceeds the original 16.7 ms frame target at the maximum cap, and draw submission is not a compositor frame measurement. The default limit remains 1,000 and smaller limits remain available for clarity. [Diagnostic data](../artifacts/testing/styled-graph-performance.json) records the workload.

## Remaining acceptance work

The original 400 MB aggregate working-set target has not been met in the desktop stress measurement. The earlier packaged renderer measurement used approximately 448 MB after renderer garbage collection. That figure includes the main, renderer, GPU and network-service processes; it is not JavaScript heap size. It excludes a full all-process forced-collection protocol.

The strict 16.7 ms p95 displayed-frame interval has not been established. Earlier draw-submission measurements were faster than that target, but recorded frame intervals included missed refresh deadlines. The current 3,000-node styled-graph diagnostic also exceeds the target for draw submission. These measures are distinguished in the raw reports.

A one-hour soak, the complete performance table, exhaustive geometric/export acceptance, the full light/dark/high-contrast and Narrator/NVDA matrix, three independent runs on minimum hardware, a clean Windows 11 installation and a signed installer remain unverified. Local passing tests should not be read as completion of those release gates.

## Query history verification, 14 September 2026

The query-history build passed 1,865 offline tests across 19 files, including the local SPARQL conformance suite. TypeScript validation and the production build also passed.

The packaged application passed 21 desktop checks covering automatic delivery to the main editor, source preservation, independent Undo, query navigation, full-text history search, result ownership, immediate-close draft recovery, workspace replacement, cancellation and detached panes. Compact, wide and maximized screenshots were inspected.

The separately invoked live suite passed all 12 cases using Codex 0.154.0 found on PATH. Each generated query opened as a new document, preserved its source and required an explicit Run. The suite checked actual result semantics, including American-prefix matching, refinement, aggregates, optional labels, ancestor paths and imported labels.

The raw records are artifacts/query-history-domain-results.json, artifacts/query-history-desktop-results.json and artifacts/codex-live-results.json. The live suite remains excluded from ordinary testing. These results apply to the query workflow and do not replace the earlier performance and release acceptance limits.

See [Query history and responsive authoring](query-history-ux.md) for the cited UX research and inspected screenshots.

## Verified executable

```text
D:\git\axiom\artifacts\electron-20260914T232657Z\Axiom-win32-x64\Axiom.exe
```

The portable folder is approximately 414 MiB. Keep its DLLs, resources and locales beside the EXE. [Query-history delivery metadata](../artifacts/testing/query-history-delivery-verification.json) records the build, test results and SHA-256 hashes.

## Archive integrity

[winui-manifest.json](../archive/winui-manifest.json) lists 102 archived authored files and their SHA-256 hashes. Every ZIP entry was checked before retirement. The ZIP SHA-256 is:

```text
06dd6acb72a4ee12b4700502c05529c2ea9ce4b11769154186e1ecd469996170
```

No .NET project participates in the active source tree, package scripts or CI.


## Formatting and result freshness

The formatting fix passed 1,693 targeted offline checks, including 32 query-identity regressions and the SPARQL conformance suite. Four desktop tests passed against the packaged executable. They verify that formatting, comments and Undo preserve the recorded execution, while substantive query edits and underlying data changes retain their warnings. Formatting also preserves validation of a generated proposal.

The comparison recognizes presentation changes through parsed SPARQL tokens. It does not attempt to prove equivalence between arbitrary query rewrites.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260915T013411Z\Axiom-win32-x64\Axiom.exe
```

The delivery record is artifacts/testing/query-format-delivery-verification.json. Test reports are artifacts/query-format-identity-tests.json and artifacts/query-format-desktop-results.json.

## Query results as workbench tabs

Each completed query opens a numbered Query results tab. Its saved execution record contains the SPARQL, originating query, ontology and run details. Closing the Query pane leaves the results available. Open query preserves newer drafts by restoring changed execution text as a separate query document. Result tabs retain their source reference after cache eviction or restart.

The full offline suite passed 1,907 tests. The packaged executable passed 31 desktop tests across query authoring, result ownership, docking, restart, formatting, SPARQL query forms, native menus and cancellation. Ten new service tests cover immutable executions and query recovery. Eight new desktop cases cover the results tabs. Type checking, formatting checks for the implementation files and the build passed.

Rows remain subject to the existing in-memory cache limit. Expired rows are identified explicitly and require a user-initiated rerun. The saved execution text is retained on disk. Legacy records without a recorded completion time display that the time is unavailable.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260915T020009Z\Axiom-win32-x64\Axiom.exe
```

artifacts/testing/query-results-delivery-verification.json records SHA-256 hashes, comparison of 17 packaged runtime files with the tested build, and test reports. The real Codex suite was not rerun for this UI change; it remains an explicit opt-in suite.
