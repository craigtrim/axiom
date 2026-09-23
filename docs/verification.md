# Electron verification

The Electron application is the sole active application. This record separates observed checks from release acceptance work that remains unverified.

## Taxonomy suggestions through Codex, 14 September 2026

The taxonomy update passed TypeScript checking and all 1,932 local tests, including 25 checks for context construction, parsing, normalized names, duplicate handling and class versus individual assertions.

The packaged executable passed 25 desktop checks: nine taxonomy journeys, eleven SPARQL-authoring regressions and five menu, keyboard and existing-research regressions. These cover reviewed batch insertion and Undo, empty results, cancellation, stale proposals, changes of selection, small windows and detached taxonomy dialogs.

All four opt-in taxonomy cases passed using the real Codex on PATH, codex-cli 0.154.0. Codex proposed the missing water and air vehicle categories without flattening deeper vehicle subtypes, returned no additions for a complete RGB taxonomy, found seven planet individuals while excluding the existing Earth instance, and reviewed the shipped Pizza branch. No provider was mocked or skipped in that suite. The unrelated live SPARQL cases were not repeated for this update.

```text
D:\git\axiom\artifacts\electron-20260915T031422Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/taxonomy-delivery-verification.json) retains test reports and package hashes. All 24 compiled runtime files in the package matched the build. [Taxonomy suggestions](taxonomy-suggestions.md) documents context limits and proposal review. The [real Codex report](../artifacts/taxonomy-live-results.json) retains the prompts and responses.

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

| Operation                                  |       Observed |
| ------------------------------------------ | -------------: |
| Generate 100,000 orders and indexes        |         164 ms |
| Margherita adjacency at 100,000 orders     |         7.1 ms |
| Customer adjacency at 100,000 orders       |        11.1 ms |
| Filter 100,000 rows                        |          59 ms |
| Sort 100,000 rows by price                 |          38 ms |
| Worked query 1, all fixture sizes          |     below 1 ms |
| Worked query 4, 100,000 orders             |         292 ms |
| Worked query 5, 100,000 orders             |         425 ms |
| Hierarchy / radial / grid, 3,000 nodes     | 33 / 17 / 6 ms |
| Fresh force layout, 3,000 nodes, 240 ticks |       2,531 ms |

The domain query measurements exclude IPC and snapshot construction. They do not establish the full submission-to-result budgets. Fresh force settling exceeds the original 2,000 ms target on this measurement.

The desktop harness records 600 actual graph draw events per workload. It applies repeated small zoom transforms to keep drawing active, and separately records draw submission time and the interval between completed draws. It is a diagnostic workload, not an external compositor trace or the exact slow-pan procedure specified by PB-01.

The earlier rewrite package produced the measurements below. Those complete benchmark workloads have not been repeated for the current package. The current styled-graph diagnostic is reported separately below.

| Desktop operation                               |       Observed |
| ----------------------------------------------- | -------------: |
| Startup to graph ready                          |         918 ms |
| Regenerate 100,000 orders to updated UI         |         247 ms |
| 1,000-node force, draw submission p95 / p99     |   3.8 / 4.0 ms |
| 3,000-node force, draw submission p95 / p99     |  9.5 / 11.2 ms |
| 3,000-node grid, draw submission p95 / p99      |  9.4 / 10.4 ms |
| 3,000-node force, frame interval p95 / p99      | 17.4 / 18.3 ms |
| 3,000-node grid, frame interval p95 / p99       | 17.4 / 18.1 ms |
| Aggregate working set after renderer collection |         448 MB |

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

## Adaptive pane layouts

Implemented on 15 September 2026. All ten dockable component types measure the space inside their pane. Research, forms, tables and editors use expanded, narrow and shallow layouts. Compact views reserve primary actions outside the content scroller and expose secondary content through Options, More and named disclosures. Graph retains its canvas and existing presentation.

All 149 desktop cases pass across the packaged run and focused follow-ups, including the seven adaptive cases. They cover retained Research prompts and selections, original request attribution, stale results, Inspector submission and focus, Query editor identity and undo, Graph state, Entity details, query results, pane recovery and primary action visibility. Automated axe scans report no violations for the selected WCAG A/AA tags in narrow and shallow Edge Inspector, narrow Research Options and narrow Source. These scans do not establish complete accessibility conformance.

The offline suite passes 1,932 tests across 22 files. Type checking and formatting checks for the implementation files pass. The package's 24 JavaScript, HTML and CSS runtime files match the build byte for byte.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260915T195959Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/adaptive-pane-delivery-verification.json) contains SHA-256 hashes and the runtime comparison. The [desktop report](../artifacts/adaptive-desktop-results.json) records the initial packaged run. The [follow-up report](../artifacts/adaptive-desktop-followup.json) and [final query checks](../artifacts/adaptive-desktop-final.json) cover the remaining cases. The initial run passed 140 cases; follow-ups updated the remaining compact-control interactions and repeated cases that received unexpected A/W text. The last two query checks used AXIOM_TEST_BACKGROUND=1 to isolate test windows from physical desktop input. The large-dataset query assertion allows 30 seconds for the same expected 103 rows. These are local artifacts. The [design research](adaptive-pane-ux.md) records sources, layout rules and remaining usability measurements. Real-assistant tests were not rerun for this layout change; ordinary desktop tests use controlled assistant responses.

## Assistant activity and duplicate-run protection

Research, Query generation and both taxonomy suggestion actions now show a fixed activity strip on their owning pane, with assistant/task text, elapsed time and Cancel. A tab spinner remains visible when another tab is selected. Query feedback survives closing its composer, and reopening Research or Query restores the active request. Taxonomy repeats the status in its review dialog. All use the same synchronous launch reservation, with cancellation retaining the lock until the request settles. [Assistant activity behavior](assistant-activity.md) describes the lifecycle.

The offline suite passes 1,940 tests across 23 files. The packaged executable passes all 32 desktop checks for adaptive panes, assistant activity, query authoring and taxonomy suggestions. The new cases exercise 100 repeated clicks and 100 direct IPC retries, cancellation, malformed output, reopening panes, both taxonomy modes, original entity attribution, detached narrow/shallow/recovery layouts, reduced motion and a targeted axe scan of the activity strip. Type checking and formatting pass. The package's 24 runtime files match the tested build byte for byte.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260915T221124Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/assistant-activity-delivery-verification.json) contains executable/archive hashes, runtime comparison and test results. The [packaged desktop report](../artifacts/assistant-activity-packaged.json) records all 32 passing cases. Desktop checks use controlled assistant subprocesses; live Codex and Claude services were not invoked.

## Persistent Research cache

Research now caches validated results by the MD5 hash of the exact prompt. An identical prompt reuses its original result before assistant discovery or launch. Cached results show their original assistant and completion time. Internal session/version counters remain local freshness checks, so unchanged prompts can survive workspace reopening and app restart. Prompt text, whitespace, ontology context and web-setting changes produce separate cache entries. [Cache behavior](assistant-activity.md#research-cache) describes persistence and failure handling.

All 1,958 offline tests pass across 24 files, including 18 new cache cases. The packaged executable passes 13 desktop checks covering Research cache reuse across workspace reopening and app restart, reuse when no CLI is reported available, changed prompts, assistant lifecycle and adaptive panes. Type checking and formatting pass. The package's 24 runtime files match the tested build.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260915T222516Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/research-cache-delivery-verification.json) contains hashes and validation results. The [packaged report](../artifacts/research-cache-packaged.json) records all 13 passing desktop cases. Tests use controlled local assistant subprocesses and do not invoke live Codex or Claude services.

## Plain-language taxonomy suggestions

Add children and Find instances now send their branch context to Codex as ordinary text. The prompt retains names, descriptions, parent links, descendants and class conditions. It invites general subject knowledge even when no children are recorded. Codex returns a short outline of names, descriptions and reasons. Axiom parses it and assigns entity kinds and parent relationships locally, then uses the existing review, duplicate checks, Apply and Undo workflow.

All 1,988 offline tests pass across 25 files, including 30 new translation and parsing cases. The 26 desktop checks pass for taxonomy suggestions, assistant activity, Research caching and query authoring. Type checking and formatting checks pass. Four checks against the packaged executable cover class and individual creation, repeated-run protection and persistent Research caching. Its 24 runtime files match the tested build byte for byte.

All five live taxonomy cases pass with Codex 0.154.0: missing vehicle categories, a complete RGB branch, named planets, the shipped Pizza branch and Meaty Pizza without recorded children. Meaty Pizza returned eight suggestions, including Pepperoni Pizza, Sausage Pizza and Ham Pizza. The test accepted one suggestion and undid its creation. These are observed responses from model knowledge; proposed membership still needs user review. An initial Meaty Pizza test used search text that did not match the existing hierarchy filter and stopped before invoking Codex. The corrected test searches for Meaty and selects the Meaty Pizza row.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260915T224749Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/taxonomy-language-delivery-verification.json) contains hashes and validation results. The [desktop report](../artifacts/taxonomy-language-desktop.json), [live Codex report](../artifacts/taxonomy-language-live.json) and [packaged report](../artifacts/taxonomy-language-packaged.json) retain the results. [Taxonomy suggestions](taxonomy-suggestions.md) describes the exchange and unchanged review workflow.

## Instance reports and grouped menus

Show instances opens one paged Individuals report from hierarchy and graph context menus, the graph selection bar, hierarchy counts, Inspector usage counts and the Edit menu. The existing Individuals class filters use the same report. Each page contains at most 100 direct instances; filtering and paging leave the graph unchanged. Named and generated records share the same membership lookup used by the hierarchy count. Report rows open Inspector details, and the report retains its class when selection changes or its pane is closed and reopened.

The approved [menu design](menu-ux.md) is implemented with logical separators, checked pin state, conditional class commands and Delete class last. Window has a Move pane submenu. Context menus retain access keys, keyboard navigation and focus restoration; disabled items can receive focus without executing.

All 1,999 offline tests pass across 26 files. Eight new desktop checks cover every report entry point, all 527 Giardiniera records, empty classes, ordinary ontologies, workspace replacement, detached panes and targeted accessibility scans in light, dark and forced colors. Nine related menu, keyboard and graph-editing regressions pass. The nine taxonomy assistant cases also pass in the earlier combined run. Type checking, formatting and the whitespace check pass.

The packaged executable passes all eight new cases and the native Edit menu report case. Its 24 runtime files match the tested build byte for byte. Screenshots were inspected for the grouped menu and shallow report. Accessibility verification used automated scans and keyboard tests; an actual screen-reader pass and a user task-time study have not been performed.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260916T022626Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/instances-menu-delivery-verification.json) contains hashes and validation results. The [report and menu checks](../artifacts/instances-menu-desktop.json), [related regressions](../artifacts/instances-menu-regressions.json) and [packaged checks](../artifacts/instances-menu-packaged.json) retain the passing outcomes. The earlier combined run found an access-key label mismatch in the new menu tests; it was corrected before these final runs. Taxonomy regression tests use controlled assistant subprocesses.

## Counts and disabled collection actions

Instance actions now show the direct-instance count everywhere they are offered. Show instances (0) remains visible and disabled; Show instances (527) opens the existing paged report. The shared rule covers hierarchy and graph menus, the graph selection button, hierarchy and Inspector counts, Edit, the command palette and class filters. Counts update after creation and Undo. Creation and discovery remain available for empty classes. The report and graph behavior are unchanged. [Menu design](menu-ux.md#counts-and-action-availability) records the rule and related branch and graph controls.

All 1,999 offline tests pass across 26 files. Type checking, formatting and the whitespace check pass. The final outcomes of 22 packaged desktop checks pass, covering zero and positive counts, live creation/Undo, all report paths, disabled keyboard and palette invocation, class filters, graph preservation, detached panes and targeted accessibility scans in light, dark and forced colors. The checks also cover existing menu navigation, edge editing and taxonomy suggestions. The disabled zero-count menu was inspected visually.

The first packaged run passed 21 checks; its remaining assertion used an exact palette label that omitted the displayed shortcut. The corrected assertion and the zero-count action test both passed on rerun. An earlier Windows keyboard run stopped when its window lost focus; the packaged run passed that check. These harness issues and final outcomes are recorded in the [delivery record](../artifacts/testing/instance-counts-delivery-verification.json), with the [packaged report](../artifacts/instance-counts-packaged.json) and [final control checks](../artifacts/instance-counts-final-controls.json).

The package's 24 runtime files match the tested build byte for byte.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260916T140235Z\Axiom-win32-x64\Axiom.exe
```

## Research setup visible on first open

Research now displays its assistant selector, prompt template, instructions and web setting immediately in every working pane layout. The Options/Results toggle and initial Ready to research placeholder are removed. Narrow and shallow panes keep the form and returned results in one scrolling body; wide, tall panes put results beside the form when a response exists. Run, progress, cancellation and Apply remain available outside the body scroller. Saved prompt text and Research caching are preserved.

The packaged executable passes six focused desktop checks covering the initial form at narrow, shallow and expanded sizes; prompt and review state through docking; keyboard accessibility and targeted axe scans; duplicate-run protection; cancellation; cache reuse across reopening and restart; sources; and applying and undoing suggestions. Type checking, formatting and the whitespace check pass. The initial narrow form was inspected visually. The package's 24 runtime files match the tested build byte for byte.

The existing review test was corrected to expect Cancel to be disabled after completion. Active cancellation through the native menu is verified by the assistant lifecycle test. Tests use controlled local assistant responses and do not invoke live assistants.

Verified executable:

```text
D:\git\axiom\artifacts\electron-20260916T150132Z\Axiom-win32-x64\Axiom.exe
```

The [delivery record](../artifacts/testing/research-form-delivery-verification.json) contains build hashes and verification results. The [packaged report](../artifacts/research-form-packaged.json) contains all six passing checks. [Adaptive pane behavior](adaptive-pane-ux.md#research-layouts) describes the revised layout.

## Graph relationship creation (16 September 2026)

Connect nodes now starts from the graph toolbar, node context menu, Graph > Edges, command palette or C shortcut. A selected node also has a 32-pixel drag handle. Node and label targets accept clicks or drops with a minimum 48-pixel target diameter at low zoom. Toolbar instructions and an arrow preview show the pending connection. A dialog confirms its direction and relationship before adding one assertion. Existing node dragging and edge editing remain available.

Connection mode pauses layout movement and releases the pause on completion, cancellation or pane closure. It preserves the saved Freeze setting. Duplicate assertions, stale drafts and full-graph refusal leave data unchanged. Admission preserves both endpoints within the configured node budget. Undo and Redo restore the assertion and graph together.

Validation:

- TypeScript passed. All 2,009 offline tests passed across 27 files.
- Fifteen distinct desktop workflows passed against the packaged executable. Coverage includes click and drag creation, low-zoom targets, keyboard and context commands, detached narrow panes, accessibility scans, duplicate and stale drafts, pause/resume, pane closure, graph limits, Undo/Redo and the five existing edge-editing workflows.
- The initial capacity fixture protected every seeded node. The corrected fixture expands one root and leaves its children evictable; refusal, admission and stale-workspace checks then passed. Final results are collected by workflow in `artifacts/testing/edge-creation-delivery-verification.json`.
- Every packaged JavaScript, CSS and HTML runtime file matched the current build. The verification record includes executable and archive SHA-256 hashes.

Executable: `D:\git\axiom\artifacts\electron-20260916T153541Z\Axiom-win32-x64\Axiom.exe`.

## Selection-based graph gestures (16 September 2026)

Graph gestures now follow the [yEd Edit Mode manual](https://yed.yworks.com/support/manual/edit_mode.html): click to select, drag a selected node to move, and drag from an unselected node to draw an edge. Releasing on another node attaches it. Empty-space drops add bends; Escape and right-click cancel. Small square markers distinguish selection from graph seed membership. The toolbar stays available while drawing.

Class-to-class edges attach as subclass-of, individual-to-class edges as instance-of, and properties of the same kind as subproperty-of. Other pairs retain an attached preview while a compact picker asks for the property. Existing edge Inspector editing remains available. Bends persist through Undo, Redo and workspace reload. Keyboard commands and detached panes share the same attachment behavior.

Validation:

- TypeScript, formatting and the whitespace check passed. All 2,011 offline tests passed across 27 files.
- All 20 desktop workflows passed against the packaged executable. They cover the new gestures, small targets, cancellation, pane closure, stale data, duplicate edges, layout pause/resume, property-error recovery, graph capacity, existing edge editing, node creation, native commands and compact panes.
- A pane-closure test exposed a frame callback reading a cleared canvas reference. The callback now checks its captured canvas, and the cancellation test passed in both the development and packaged builds.
- The selected node, pending edge and attached edge screenshots were inspected. The property picker passed a targeted automated accessibility scan.
- All 24 packaged JavaScript, CSS and HTML files matched the tested build. The delivery record contains executable and archive SHA-256 hashes.

Executable:

```text
D:\git\axiom\artifacts\electron-20260916T175642Z\Axiom-win32-x64\Axiom.exe
```

Verification record: `artifacts/testing/yed-gestures-delivery-verification.json`. Desktop results: `artifacts/yed-gestures-packaged.json`. Offline results: `artifacts/yed-gestures-unit.json`.

## Endpoint circles removed (16 September 2026)

Selected edges no longer display white endpoint circles. Their drag controls and styling were removed. The square bend handle, drawing gestures, edge Inspector and context-menu reconnection remain available.

TypeScript passed. All 12 graph workflows passed against the packaged executable, covering drawing, bending, cancellation, Undo, workspace reload, detached panes and menu reconnection. The adapted menu test initially clicked before its asynchronous prompt was ready; waiting for the prompt resolved that test failure. The selected-edge screenshot was inspected, and all 24 packaged runtime files match the tested build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260916T181247Z\Axiom-win32-x64\Axiom.exe
```

Verification record: `artifacts/testing/edge-circles-removed-delivery-verification.json`.

## Details follows selection when explicitly opened (16 September 2026)

The entity tab and its opening actions are named Details. View > Details opens the same reusable pane, with Ctrl+8 as its shortcut. An open Details pane follows entity selection without activating its tab or taking focus from the graph. Clicking a node leaves a closed Details pane closed. Unsaved drafts remain attached to their entities, and older saved entity tabs restore as one Details pane.

TypeScript and 61 targeted offline checks passed. All 13 packaged desktop workflows passed, including actual graph clicks, explicit View access, hidden and detached panes, close/reopen and restart, older layout migration, shared drafts, identifier changes, native menu coverage and docking. A layout-reset regression was corrected so retaining Details leaves Graph selected. The selection-following pane was inspected visually. All 24 packaged runtime files matched the tested build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260916T192826Z\Axiom-win32-x64\Axiom.exe
```

Verification record: `artifacts/testing/details-delivery-verification.json`. Desktop results: `artifacts/details-packaged.json`. Targeted offline results: `artifacts/details-unit.json`.

## OWL intersection delivery, 2026-09-16

- Imported `C:\Users\Craig\Desktop\courses.owl` through the packaged application's File > Open flow in an isolated profile. All 607 intersections resolved, with 23,836 source statements preserved and 5,868 named classes in Hierarchy.
- Checked the four-node graph for 3D Design and 3D Printing, readable AND junctions, named taxonomy parents, Inspector explanations and explicit Details opening. Selecting a node did not open Details.
- The full offline suite passed 2,020 tests. Subsequent focused checks passed 32 graph/workspace tests and nine intersection tests, including light/dark SVG rendering. TypeScript and whitespace checks passed.
- The packaged desktop suite passed 16 tests covering Details, node movement, edge creation, edge editing and the actual courses ontology. The final build passed the courses desktop test again after the caption placement and AND lettering adjustment.
- All 24 packaged runtime files match the build output. The Desktop ontology's SHA-256 remains `01eb95296ba37c37911c73797b6c7715e47a98e0416f595f82440ef6a7935c4b`.
- Final executable: `D:\git\axiom\artifacts\electron-20260916T200631Z\Axiom-win32-x64\Axiom.exe`.
- Records: `artifacts/intersections-unit.json`, `artifacts/intersections-focused.json`, `artifacts/intersections-render.json`, `artifacts/intersections-packaged.json`, `artifacts/intersections-final-desktop.json`, and `artifacts/testing/intersections-delivery-verification.json`.

## Shared node and edge Details, 2026-09-16

Details now follows both node and edge selection in the same tab. Selecting an edge updates an existing tab without opening it or taking focus from Graph. View > Details, Alt+Enter, Graph > Edges > Details, the graph action and the edge context menu explicitly open that tab. Detached and background tabs retain the same behavior.

Inspector and Details share retained edge drafts. Switching selection preserves those edits, and Save workspace applies them. Synthetic intersection member edges retain their read-only explanation. The edge routing instructions refer to the remaining bend handle and context-menu reconnection.

Validation passed: TypeScript, 58 targeted domain tests, 12 packaged Details/edge desktop tests and the native edge-menu journey. The packaged runtime matches all 24 build files. Records are in `artifacts/edge-details-unit.json`, `artifacts/edge-details-packaged.json`, `artifacts/edge-details-menu-packaged.json` and `artifacts/testing/edge-details-delivery-verification.json`.

Executable: `D:\git\axiom\artifacts\electron-20260916T204248Z\Axiom-win32-x64\Axiom.exe`.

## Graph appearance settings, 2026-09-16

Added Edit > Settings > Graph appearance, backed by the existing CSS-like stylesheet. The editor analyzes dataset-wide node kinds, named classes, and relationship types. It offers coordinated Paul Tol palettes, class-node versus class-instance rules, previews, fixed sizing, metric sizing, and weighted combinations with bounded diameters. Graph > Edit graph stylesheet retains direct access to the Advanced section.

The complete offline suite passed 2,033 tests before the final export-legend adjustment. After that adjustment, 33 focused tests passed, including the new legend regression. TypeScript passed. The final packaged application passed 16 desktop journeys covering appearance settings, weighted sizing, geometry, Undo/Redo, SVG export, saved workspaces, node/edge Details, and OWL intersections.

Dataset analysis took 987 ms on the 100,000-order example, comprising 112,614 graph nodes and 312,797 relationships. A cached read took approximately 0.014 ms on this machine. This is one local measurement, not a performance guarantee.

All 24 packaged runtime files match the build output. Package SHA-256: 2050654637e3d9b9095a5596854ddd9274b8c1fe996cc3537f046c27de0bdc54.

Executable: `D:\git\axiom\artifacts\electron-20260917T013410Z\Axiom-win32-x64\Axiom.exe`.

Research and behavior: `docs/graph-appearance.md`. Records: `artifacts/graph-appearance-all-unit.json`, `artifacts/graph-appearance-final-unit.json`, `artifacts/graph-appearance-final-packaged.json`, `artifacts/testing/graph-appearance-analysis-performance.json`, and `artifacts/testing/graph-appearance-package-verification.json`.

## Compact Details, graph tabs and intersection branches (16 September 2026)

Intersection expressions render as Y-shaped connectors between named classes. Each branch retains its original subclass or equivalence axiom. Editing or removing a member updates the expression; one remaining member becomes a direct relationship. Anonymous intersection nodes stay out of Hierarchy.

Details uses an editable Predicate / Value / Language table for entity statements. Local identifiers omit the namespace, values wrap, and row options expose datatype and named-graph metadata. Nodes and edges share the explicitly opened Details pane, with drafts preserved across selection changes.

Show in graph offers Current graph and New graph. Each graph keeps its own layout, selection and viewport through workspace save and reopen. Find in taxonomy expands, scrolls and highlights the corresponding row while keyboard focus stays on Graph.

Claude is the shared default for Research, query generation, Add children and Find instances. Codex remains selectable. Codex-specific fixtures explicitly select their provider. Local intersection suggestions use an index of existing class labels, show word coverage and unmatched words, and require review before adding an axiom.

Validation:

- TypeScript and the whitespace check passed. All 2,041 offline tests passed.
- All 29 packaged desktop checks passed for Details, retained drafts, detached panes, graph drawing and editing, appearance settings, export, workspace reopen, graph tabs, taxonomy navigation, provider switching and intersection suggestions.
- Nine additional packaged taxonomy-assistant checks passed using a local fake Codex process. They cover review, duplicate protection, stale results, cancellation, retries and detached windows. Live model tests were not run.
- The packaged application loaded `C:\Users\Craig\Desktop\courses.owl`: 5,868 named classes, 607 intersections and 23,836 triples. The example renders as three named nodes joined by a Y-shaped connector. Viewing it preserves the RDF, and the Desktop file's SHA-256 remains `01eb95296ba37c37911c73797b6c7715e47a98e0416f595f82440ef6a7935c4b`.
- All 24 packaged runtime files match the tested build. The application archive SHA-256 is `24c71bb61866c35a3893de5672c6b41e4a0bea65415dac9da154c4801df2e974`.
- Screenshots of the compact table, graph tabs and intersection branches were inspected.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T022357Z\Axiom-win32-x64\Axiom.exe
```

Records: `artifacts/ux-final-unit.json`, `artifacts/ux-final-packaged.json`, `artifacts/ux-final-taxonomy-packaged.json` and `artifacts/testing/ux-final-package-verification.json`.

## Details Back navigation (16 September 2026)

Details now has a visible Back button at the start of its action row. Backspace returns to the previous node or edge while focus is in Details. Inputs, text areas, editable content, menus and dialogs retain their own keyboard behavior. Clicking non-editable pane content establishes the keyboard scope; focus in Graph leaves Details history alone.

History retains up to 100 prior items for the current session. It preserves drafts, survives docking and pane closure, restores the owning graph for an edge, and skips unavailable destinations. Loading another ontology clears it. The button is disabled when no previous item remains.

TypeScript and all 29 keyboard unit checks passed. Sixteen distinct packaged desktop workflows passed, covering the existing Details and keyboard behavior plus resource-link navigation, repeated Backspace, text deletion, node and edge drafts, modal focus, detached panes, graph switching, pane closure and removed edges. The removed-edge fixture was corrected to account for removal clearing selection. A native-menu test passed on rerun after its focus guard stopped the initial attempt.

The narrow Details pane was inspected visually. All 24 packaged runtime files match the tested build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T032028Z\Axiom-win32-x64\Axiom.exe
```

Records: `artifacts/details-back-packaged.json`, `artifacts/details-back-rerun-packaged.json`, `artifacts/testing/details-back-package-verification.json` and `artifacts/testing/details-back-delivery-verification.json`.

## Details grid and editable native Source (16 September 2026)

Details now uses two columns, Predicate and Value. Predicates use dropdowns with search and an explicit Add predicate action. Language, datatype and named-graph metadata remain in row options. Value fields grow without resize handles, and referenced resources have a labelled Open details action.

Grid edits apply on leaving a value field or pressing Enter; Shift+Enter inserts a newline. Predicate changes apply on selection. The Details toolbar reports editing and saving status without an Apply changes button. Edge Details uses the same automatic saving behavior. Inspector retains its existing manual Apply action.

The Source disclosure replaces Identifier. It shows a formatted snippet in the loaded RDF serialization, including the selected entity's anonymous structures. Grid edits refresh a clean snippet. Source edits remain drafts until Save source validates and applies them atomically to all views. Invalid syntax, unrelated named subjects and conflicting entity changes are rejected without changing the ontology. Drafts survive navigation and pane closure, and changes support Undo. Saving a workspace with an unapplied source draft asks the user to save or discard that source first.

Validation:

- TypeScript passed, and all 2,050 offline tests passed. Source tests cover six RDF serializations, anonymous structures, shared references, conflicts, renames and Undo.
- Forty distinct packaged desktop workflows passed across the new grid and native Source editor, Back navigation, node and edge editing, shared Inspector drafts, graph reconnection, graph tabs, full Source view, intersections and authoring. Older test selectors were updated for dropdowns and automatic saving. The graph workspace test now uses a fresh file, and a coordinate-based reconnection check passed on rerun.
- The packaged app loaded the Desktop courses.owl for the intersection check. Its SHA-256 remains unchanged: 01eb95296ba37c37911c73797b6c7715e47a98e0416f595f82440ef6a7935c4b.
- The narrow Details grid and expanded Source snippet were inspected visually. All 25 packaged runtime files match the tested build. The archive SHA-256 is d139de226d1191b1c9541513780e78a1842d457d7a7a09c4d540614f355d79dc.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T040351Z\Axiom-win32-x64\Axiom.exe
```

Records: `artifacts/details-source-unit.json`, `artifacts/details-source-packaged.json`, `artifacts/details-source-packaged-rerun.json`, `artifacts/details-source-packaged-authoring.json` and `artifacts/testing/details-source-delivery-verification.json`.

## Last-session startup (17 September 2026)

Axiom restores its last session before rendering the main window. A fresh profile opens an empty workspace with a blank graph and the standard owl:Thing root. Pizza remains available through File > Open Pizza example. File > Close records an empty session for the next launch.

The profile stores a separate copy of the ontology, graph views, positions, selection, selected edge, pane layout and workspace Save destination. Imported files can move without preventing session restoration. Opening, importing, creating or saving a workspace checkpoints the session. Closing captures the final workbench state. Save, Discard and Cancel retain their existing meanings; discarded edits do not reappear after restart. Session writes replace files atomically and retain a previous valid copy for recovery. If neither copy can be restored, the app opens empty and reports the failure. Keyboard preferences remain global.

Demo-based tests now open the example explicitly. This exposed two interaction defects: a creation form could be hidden beneath collapsed ancestors, and replacing the graph's nodes could clear its selected node. Both were corrected and covered by the packaged authoring and export journeys.

Validation: TypeScript and the whitespace check passed. The complete offline suite passed 2,057 tests. The final executable passed all 37 desktop workflows covering fresh profiles, repeated restarts, moved source files, graph tabs and positions, selected edges, Details and Source, Save/Discard/Cancel, backup recovery, demo opening, File > Close, authoring, export and pane persistence. Live assistant tests and the performance benchmarks were not run. The empty startup screen was inspected visually.

All 26 compiled runtime files match the tested build. Archive SHA-256: 86f353af32f120346b539ead19a290cee99f0049fd0e414d7a282c48167db621.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T135625Z\Axiom-win32-x64\Axiom.exe
```

Records: `artifacts/session-all-unit.json`, `artifacts/session-final-packaged.json`, `artifacts/testing/session-package-verification.json` and `artifacts/testing/session-delivery-verification.json`.

## Details resource values and class parents (17 September 2026)

Details uses recognized skos:, dc: and dcterms: predicate names. The named-class declaration stays first and read-only; instance types remain editable. Resource values and edge endpoints use indexed type-ahead. A row's ellipsis opens the referenced entity and its scoped Source in the same Details tab. The old statement-options dialog has been removed.

Add parent creates ordinary subclass statements. A simple imported subclass intersection appears as individual parent rows; editing a member saves ordinary statements while preserving shared and annotated structures. The local suggestion dialog defaults to Add parents. Equivalent intersections require an explicit choice. Scoped Turtle uses property lists and collection syntax while retaining shared, cyclic and graph-name identities where required. Anonymous Details uses the owning namespace and the same editable source snippet.

Mouse selection was checked in docked and detached panes. The popup belongs to the input's window and does not surrender focus to the Details navigation handler before selection. Short panes keep the toolbar above a full-width table. The narrow and detached layouts were inspected visually.

Validation: TypeScript and the whitespace check passed. All 2,066 offline tests and 42 desktop workflows passed. The desktop suite ran against the delivery executable and includes source round trips, metadata retention, parent selection, explicit equivalence, navigation, detached editing, graph routes, native courses.owl loading and session restoration. The 100,000-class index built in 1.29 seconds in the final offline run; 100 selective warm queries had a 0.035 ms 95th percentile. These timings measure the index, excluding IPC and the 80 ms input debounce.

All 26 packaged runtime files match the tested build. Archive SHA-256: fe2bc5ec1316643b92c7faa110b6e4d5f3d60ae5c5eba4fdfeda55a04fcaf0e8.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T151255Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/details-values-final-unit.json, artifacts/details-values-delivery-packaged.json and artifacts/testing/details-values-delivery-verification.json. Implementation notes: docs/details-editing.md.

## File Open submenu (17 September 2026)

File > Open now contains Workspace... (Ctrl+O), Recent and Examples > Pizza. The flat opening commands have been moved into these submenus. Existing command identities and shortcut customization remain intact.

Recent keeps the last 12 successfully opened or saved workspace and ontology files, newest first. It persists independently of workspace settings, removes duplicates and shows directories when filenames match. Empty history disables Recent. A known source file from the last session seeds history when upgrading an existing profile. Recent opens use the same unsaved-change prompt and validation as the file chooser.

Validation: TypeScript, whitespace and 39 focused offline tests passed. All 16 packaged desktop checks passed across the main run and menu-audit follow-up. These cover menu structure, Ctrl+O, the Pizza example, recent-file persistence, duplicate names, normal workspace Save/Open, cancellation, missing and malformed files, session restoration and menu coverage. The first menu audit found an existing registry omission for Graph appearance; its dedicated workflow and the corrected audit both passed.

All 26 packaged runtime files match the build. Archive SHA-256: d91c93d203da63a743876738217fff3c5f840b7cdc009ff5db9824edafffbf58.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T155813Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/file-open-unit.json, artifacts/file-open-packaged.json, artifacts/file-open-menu-audit.json and artifacts/testing/file-open-delivery-verification.json.

## Courses equivalence migration and graph refinements (17 September 2026)

The Desktop courses.owl file now has 607 equivalent-class intersection definitions. Canonical RDF comparison verified that the migration changed only the requested owner predicates, preserving six mixed-parent statements and every other statement. The original is backed up beside the file as courses.owl.before-equivalence-20260917T161232Z.bak. File and backup hashes were checked after the desktop tests.

Axiom preserves explicit equivalence. Simple future anonymous subclass intersections are normalized to separate parent statements, without adding equivalence. The fixed class declaration has no ellipsis. Details and full Source share syntax highlighting, with formatted Turtle and RDF/XML subject blocks. Connect nodes was removed from node context menus. Expand and Collapse hold exact world and screen positions, compensate toolbar reflow and avoid automatic Fit after incremental ELK results. The appearance editor uses the shared, virtualized taxonomy with class-branch styling.

Validation: TypeScript and whitespace checks passed. All 2,077 offline tests and all 31 packaged desktop tests passed. Desktop coverage includes the real migrated courses.owl, all six source formats, syntax colors, explicit source saving, Undo, Backspace, detached Details and graph panes, edge gestures, 6,000-class tree browsing, branch styles, and exact screen positions and zoom through expansion, collapse and settling in eight layouts.

All 33 packaged application files match the build. Archive SHA-256: 1d4451a20a043bc8c06ed19fd1d53fe0cb8d98ea4eebbbdb388a0414c5ff6254.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T164622Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/graph-refinement-all-unit.json, artifacts/graph-refinement-packaged-ui.json, artifacts/graph-refinement-package-check.json and artifacts/testing/courses-equivalence-migration.json.

## Absolute paths in Recent (17 September 2026)

File > Open > Recent now displays the full absolute path for every entry. Menu mnemonics and literal ampersands remain supported.

TypeScript, whitespace checks and all four packaged File Open tests passed, including exact labels, reopening, duplicate filenames, persistence and failed-open handling. All 33 packaged application files match the build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T171831Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/recent-absolute-paths-packaged.json and artifacts/recent-absolute-paths-package-check.json.

## Graph node spacing (17 September 2026)

Every graph footer has a Node spacing slider from 50% to 300%. It adjusts existing geometry for all nine layout choices, including spacing within grid clusters, without changing node size or zoom. Pinned nodes stay fixed. Radial guides stay centred on a pinned focus. Each graph saves its own value in workspace and session documents. One slider drag creates one Undo entry; menu and keyboard Undo work with the slider focused.

TypeScript and whitespace checks passed. All 47 focused domain tests and all eight packaged desktop tests passed. Coverage includes every layout, live pointer previews, keyboard controls, pins, unchanged zoom, relayout, grid frames, force settling, manual routes, per-graph saved settings, restart, styles, and fixed screen positions during Expand and Collapse. All 33 packaged application files match the build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T183907Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/graph-spacing-unit.json, artifacts/graph-spacing-packaged.json and artifacts/graph-spacing-package-check.json.

## Graph edge visibility (17 September 2026)

Each graph footer has a Show edges checkbox, checked by default. Unchecking hides lines, arrowheads, relationship captions and canvas hit targets. The ontology, graph relationships, node positions and layout inputs remain intact. Each graph saves its own visibility setting, and Undo/Redo restores it. Image exports follow the visible graph.

TypeScript, three focused domain tests and five packaged desktop tests passed. Checks cover RDF preservation, rendering and hit testing, intersection captions, image export, keyboard Undo, independent graph tabs, workspace/session restoration and the existing spacing controls. All 33 packaged application files match the build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T195430Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/edge-visibility-unit.json, artifacts/edge-visibility-packaged.json and artifacts/edge-visibility-package-check.json.

## Graph node menu and local subclass suggestions

The node context menu uses the requested three groups. Expand and Collapse occupy the same slot, with expanded state saved per graph. Suggest Sub Classes searches a local label index for existing candidate children and applies ordinary rdfs:subClassOf relationships after review. The batch supports Undo and rejects stale results.

TypeScript, 23 focused domain tests and four packaged desktop tests passed. The final dialog was visually inspected; all 33 packaged application files match the build.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T213225Z\Axiom-win32-x64\Axiom.exe
```

Records: artifacts/subclass-menu-unit.json, artifacts/subclass-menu-packaged.json and artifacts/subclass-menu-package-check.json.

## Existing parent name matching

The selected compound class is the child. Alpha Beta Gamma now finds Alpha Gamma and Beta Gamma as possible existing parents by matching shorter word sequences in order. Accepting both creates two ordinary rdfs:subClassOf links from the selected class. One Undo restores the prior statements.

TypeScript, 17 focused domain tests and three packaged desktop tests passed. The review was visually checked, and all 33 packaged application files match the build. Records: artifacts/parent-suggestions-unit.json, artifacts/parent-suggestions-packaged.json and artifacts/parent-suggestions-package-check.json.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T213719Z\Axiom-win32-x64\Axiom.exe
```

## Graph number badge visibility

Show counts appears beside Show edges, checked by default. It hides the graph node number badges without changing RDF, node positions or edge visibility. Each graph saves its setting in workspaces and restored sessions, and Undo/Redo and image exports follow the setting.

TypeScript, five focused domain tests and three packaged desktop tests passed. Visual inspection confirmed the checkbox and hidden badges. All 33 packaged application files match the build. Records: artifacts/count-visibility-unit.json, artifacts/count-visibility-packaged.json and artifacts/count-visibility-package-check.json.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T214159Z\Axiom-win32-x64\Axiom.exe
```

## Expand max

The graph toolbar now expands from all visible nodes breadth-first until the visible-node limit or reachable component is exhausted. Existing nodes are retained and stay fixed through layout. The action follows projected intersection branches, handles cycles and large adjacency lists, and is scoped to its graph tab. One Undo restores the previous view.

TypeScript, 19 focused domain tests and two packaged desktop tests passed. Desktop checks cover the real toolbar, raising the node limit, Undo/Redo, empty and isolated maps, and independent graph tabs. All 33 packaged application files match the build. Records: artifacts/expand-max-unit.json, artifacts/expand-max-packaged.json and artifacts/expand-max-package-check.json.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T215851Z\Axiom-win32-x64\Axiom.exe
```

## 15,000-node graph limit

The slider, numeric input, domain admission limit, preferences, saved graph collections and export validation share a maximum of 15,000 visible nodes. The initial value remains 1,000.

TypeScript, 14 focused domain tests and three packaged desktop tests passed. The domain check expands an actual 15,000-node graph, restores its full saved node collections, accepts its export request and rejects oversized requests. Desktop checks cover the slider endpoint, restored workspace limit and Expand max. All 33 packaged application files match the build. Records: artifacts/graph-limit-15k-unit.json, artifacts/graph-limit-15k-packaged.json and artifacts/graph-limit-15k-package-check.json.

Executable:

```text
D:\git\axiom\artifacts\electron-20260917T221126Z\Axiom-win32-x64\Axiom.exe
```

## Graph zoom-out range

Removed the 5% zoom-out floor from wheel zoom, keyboard zoom and Fit. Camera preferences accept the same small zoom levels for the original graph and additional graph tabs. A machine-precision lower bound keeps division finite. Wheel zoom preserves the pointer anchor, and keyboard zoom preserves the canvas centre. Fit also remains finite when a pane is temporarily collapsed.

TypeScript, 29 focused domain tests and three packaged desktop tests passed. Checks cover repeated zoom-out and recovery, extreme wheel deltas, whole-graph fitting across large coordinate ranges, unchanged node positions and RDF, and independent camera restoration after restart. All 33 packaged runtime files match the build. Records: artifacts/graph-zoom-unit.json, artifacts/graph-zoom-packaged.json and artifacts/graph-zoom-package-check.json.

## Center graph

Added Center beside Fit and Graph > Center graph. The camera moves to the first remaining starting node, or the node with the most visible connections if all starting nodes have been hidden. It preserves zoom, selection and node positions, works independently in each graph tab, and is disabled for empty graphs.

TypeScript and 29 keyboard/menu checks passed. An isolated packaged desktop check verified the toolbar action with a different node selected, the menu fallback after hiding the starting node, independent graph cameras and empty-state disabling. All three packaged zoom regression tests passed. The toolbar was visually checked, and all 33 packaged runtime files match the build. Records: artifacts/graph-center-desktop.json, artifacts/graph-center-keyboard.json, artifacts/graph-center-zoom-regression.json and artifacts/graph-center-package-check.json.

## Relevance-ranked graph labels

Crowded graph labels now use an equal-weight score from dataset-wide connectivity and direct instance counts, with logarithmic normalization. Starting nodes, selection, hover and pins retain explicit priority. Drawn size no longer determines relevance. The existing versioned graph-analysis cache stores scores; the renderer caches ordering per snapshot and reuses it while zooming and panning. Pointer leave clears stale hover priority.

TypeScript, 40 focused domain tests and five packaged desktop tests passed. Coverage includes real label collisions, zoom-out and zoom-in behavior, full-dataset counts outside the map, cosmetic styles, deterministic ties, 15,000-node ranking reuse, edit and Undo invalidation, visible-label hit testing, export parity and restored cameras. An isolated copy of courses.owl expanded to 5,830 nodes and 7,299 relationships and completed 24 zoom steps without renderer errors. The Desktop source hash remained unchanged. Its diagnostic draw-submission p95 was 53.7 ms; this is not a compositor FPS measurement. All 33 packaged runtime files match the build.

Records: artifacts/graph-relevance-unit.json, artifacts/graph-relevance-packaged.json, artifacts/graph-relevance-courses.json and artifacts/graph-relevance-package-check.json.

## Persistent suggestion view

Add children and Find instances open the dockable Suggestions view. Each node opens at its latest run; a new node opens ready to start a run. The history selector provides access to older runs and other nodes in the current ontology. Closing the pane or switching nodes preserves an active request. Runs, original prompts, outcomes and accepted suggestions persist across application restart.

All 74 focused service, history, parsing, activity and preference checks pass. All 19 packaged desktop checks pass, including cancellation, repeated-run protection, stale results, separate node histories, choosing an older run on another node, closing a running pane, restart, reviewed insertion and Undo, detached windows, and Research/Query regressions. The test fixture explicitly selects its mock Codex provider. After widening the history selector, three packaged checks passed again for normal review, restart and a detached narrow view. TypeScript, formatting and the whitespace check pass. All 33 packaged runtime files match the build.

Records: `artifacts/taxonomy-view-unit.json`, `artifacts/taxonomy-view-packaged.json`, `artifacts/taxonomy-view-final-layout.json` and `artifacts/taxonomy-view-package-check.json`. Screenshots: `artifacts/testing/taxonomy-view.png` and `artifacts/testing/taxonomy-view-detached.png`.

## Optional error audit logs

Failed assistant requests and desktop operations retain local audit records. Error details opens a dockable Error log tab on request; View > Error log provides earlier entries. Logs include the failing stage, timeline, prompt, rejected response, bounded process output, exit information and application context. Copy report and Show log file expose the record. Suggestions histories retain the exact failure reference after retry and restart. Recognized credentials are redacted, and write failures keep diagnostics available in memory without replacing the original error. Taxonomy parsing reports specific missing fields and malformed outline content.

All 118 focused unit checks and 22 packaged desktop checks pass. Coverage includes mock Claude and Codex failures, process exits, concurrent request separation, redaction, truncation, storage failure, restart persistence, optional opening, clipboard content, absolute log paths, generic ontology failures and native File Open failures. TypeScript, formatting and the whitespace check pass. Visual inspection confirmed the tab layout and collapsed raw-output sections. All 34 packaged runtime files match the build. The response from the older screenshot could not be recovered because that version deleted temporary assistant output.

Records: artifacts/error-audit-unit.json, artifacts/error-audit-desktop.json, artifacts/error-audit-packaged.json and artifacts/error-audit-package-check.json. Screenshots: artifacts/testing/error-audit-summary.png and artifacts/testing/error-audit-view.png.

Executable:

```text
D:\git\axiom\artifacts\electron-20260918T155905Z\Axiom-win32-x64\Axiom.exe
```

## Details ancestry breadcrumb and inline rows

Details now shows a responsive ancestry breadcrumb for classes and individuals. The selected entity has an accent background; ancestor buttons navigate the shared Details history. Wide panes show horizontal paths, while tall panes use a compact vertical trail. Multiple inheritance and instance memberships retain separate paths. Long paths fold intermediate steps, large path sets load on request, and cycles are identified without inventing roots or changing RDF. The Add parent and Add statement toolbar buttons are replaced by one Add row control in the table footer. It focuses the predicate selector and retains existing automatic cell saves.

All 25 focused domain checks pass. They cover diamond inheritance, multiple roots and instance types, equivalent-class definitions, cycles, unresolved references and traversal bounds over a dataset with 15,000 unrelated classes. Twenty-two existing Details/source desktop checks passed across the development runs; the intersection-edge fixture was updated to use an explicit equivalent-class definition. Seven packaged desktop checks pass for ancestry navigation and Back, responsive detached panes, instance/definition semantics, the inline row workflow, resized statement editing, class creation and compact grid editing. The breadcrumb accessibility scan found no serious or critical violations. TypeScript, formatting and scoped whitespace checks pass. Wide and tall screenshots were visually inspected. All 34 packaged runtime files match the build.

Records: artifacts/details-ancestry-unit.json, artifacts/details-ancestry-desktop.json, artifacts/details-ancestry-focused.json, artifacts/details-ancestry-packaged.json and artifacts/details-ancestry-package-check.json. Final screenshots: artifacts/testing/details-breadcrumb-wide.png and artifacts/testing/details-breadcrumb-tall.png.

Executable:

```text
D:\git\axiom\artifacts\electron-20260918T170631Z\Axiom-win32-x64\Axiom.exe
```

## 2026-09-18: Shared suggestions and workbench controls

- Added Suggest > Add Children, Add Parents and Define New to node context menus. Children, local parent matching and saved custom suggestions share a dockable view with Previous/Next navigation, a type selector and independent copies.
- Custom definitions persist in Axiom properties across workspace changes and restarts. Parent and custom histories retain reviewed results, original instructions, accepted values and errors. Suggestions status is confined to the Suggestions view.
- Removed repeated top toolbar actions, the filename indicator and palette icon. The Windows title bar displays Axiom followed by the absolute path, with the filename bold. View > Command palette, Ctrl+Shift+P, remapping, Alt menu paths and F10 remain available.
- Details prioritizes existing predicates in row order and excludes rdf:type from choices. Annotation values accept text or matched resources and preserve existing literal metadata.

Validation:

- TypeScript, formatting and scoped whitespace checks passed.
- 52 domain tests passed in artifacts/suggestions-unit.json.
- 10 desktop checks passed against the final executable in artifacts/suggestions-final-desktop.json. These cover native Alt/F10 navigation, remapping, palette access, title formatting, text/resource annotation edits, language preservation, global definitions, review, independent tabs, workspace reopening, history restoration, progress placement and a focused accessibility scan.
- All 16 existing taxonomy desktop regressions passed in the preceding full packaged run. That report also recorded the F10 failure subsequently fixed and covered by the final ten checks. See artifacts/suggestions-packaged.json and artifacts/suggestions-final-desktop.json.
- All 34 packaged runtime files match the build: artifacts/suggestions-package-check.json.
- Assistant calls used controlled local fixtures. No live Claude or Codex request was made.

Final executable: D:\git\axiom\artifacts\electron-20260918T182042Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Consolidated ancestry trail

Details now shows one ancestry trail from the selected entity toward the roots. Horizontal panes flow right to left; tall panes flow downward. Shared ancestors appear once in grouped stages. Basic English displays four stages: Basic English, English Language, English and Language together, and Course. The existing card styling, ancestor navigation and Details Back history remain available. Traversal is bounded by unique ancestors and handles cycles without repeated paths or RDF changes.

All eight focused domain tests and five packaged desktop tests passed. Coverage includes the exact Basic English definition and cycle, shared roots, multiple instance memberships, deep and broad taxonomies, responsive detached panes, navigation, live parent edits and a focused accessibility scan. Wide and tall screenshots were visually inspected. TypeScript and scoped formatting/whitespace checks passed. All 34 packaged runtime files match the build.

Records: artifacts/ancestry-trail-unit.json, artifacts/ancestry-trail-packaged.json and artifacts/ancestry-trail-package-check.json. Screenshots: artifacts/testing/ancestry-trail-basic-english.png and artifacts/testing/ancestry-trail-tall.png.

Executable: D:\git\axiom\artifacts\electron-20260918T193959Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Ancestry selection and taxonomy alignment

Selecting an ancestry card reveals the selected row in the taxonomy after the new Details card renders. The row aligns with that card when their visible vertical ranges overlap. Otherwise it centers in the taxonomy viewport, including when Details is detached. The reveal clears a hiding filter, retains Details focus, respects scroll boundaries and compensates for pane zoom. Ordinary taxonomy clicks preserve the current scroll position; Find in taxonomy retains Graph focus.

All nine focused desktop checks passed against the final executable, including a taxonomy with more than 2,000 classes, alignment after zoom, top and bottom scroll limits, detached panes, ancestry navigation, inline edits and the existing graph reveal action. An earlier run caught zoom rounding; the final build corrects the rendered row position after the initial scroll. TypeScript, scoped formatting and whitespace checks passed. All 34 packaged runtime files match the build. The aligned view was visually inspected.

Records: artifacts/ancestry-taxonomy-final-packaged.json, artifacts/ancestry-taxonomy-zoom-final.json and artifacts/ancestry-taxonomy-package-check.json. Screenshots: artifacts/testing/ancestry-taxonomy-alignment.png and artifacts/testing/ancestry-taxonomy-zoom.png.

Executable: D:\git\axiom\artifacts\electron-20260918T222342Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Sampled suggestion context

Each new assistant run independently samples at most 20 direct children and 20 descendants without replacement. Lists with 20 or fewer entries remain complete. The view and prompt report sampled and total counts, and history retains the exact sent sample and prompt. Full branch context remains local for duplicate detection and stale-result checks, including after partial application and restart. Large descendant branches no longer hit the former traversal limit before sampling.

All 67 focused unit checks and six packaged desktop checks passed. Coverage includes sample boundaries, distinct random samples, a branch beyond 1,500 classes, exact prompt capture, history persistence, duplicate prevention, stale results, partial application and undo/redo. One packaged check initially exceeded its five-second mock-assistant wait and passed unchanged on recheck. TypeScript, formatting and scoped whitespace checks passed. All 34 packaged runtime files match the build. Assistant calls used local mocks.

Records: artifacts/taxonomy-sampling-unit.json, artifacts/taxonomy-sampling-desktop.json, artifacts/taxonomy-sampling-packaged.json, artifacts/taxonomy-sampling-review-recheck.json and artifacts/taxonomy-sampling-package-check.json. Screenshot: artifacts/testing/taxonomy-sampled-context.png.

Executable: D:\git\axiom\artifacts\electron-20260918T223901Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Quick Find and dockable results

The top Find entities button is removed. Edit > Find and Ctrl+F open a compact modal with the text cursor ready and six type-ahead matches. Submitting opens the Find pane, also available from View > Find, and leaves the graph unchanged. The pane provides type and field filters, word/phrase/exact matching, sorting, recent searches, complete paginated results, descriptions and actions for Details, taxonomy, new/current graphs and Copy IRI. Query and filter settings survive pane closure and restart. Source and query editors keep their local Ctrl+F behavior.

The pane shares the existing resource index with Details type-ahead. Full result queries avoid the suggestion cap and cache their sorted matches for pagination. Revision changes invalidate the index. Asynchronous responses cannot overwrite a newer query. Modal dismissal restores focus before opening the results pane.

All 18 focused domain checks and nine packaged desktop checks passed. Coverage includes aliases, accents, exact matching, entity filters, 15,025-result pagination, edits and undo, settings validation, keyboard focus and remapping, closing/reopening, saved workspace restart, detached panes, accessibility, native menu navigation, source-editor Find and graph export. The existing 100,000-class type-ahead performance check passed. Early desktop checks required Electron-compatible accessibility configuration and searchbox selectors; the corrected checks caught and verified the modal focus handoff fix. TypeScript, formatting and scoped whitespace checks passed. All 34 packaged runtime files match the build. The modal and results pane screenshots were visually inspected.

Records: artifacts/find-unit.json, artifacts/find-desktop-final.json, artifacts/find-packaged.json and artifacts/find-package-check.json. Screenshots: artifacts/testing/find-quick.png, artifacts/testing/find-results.png and artifacts/testing/find-detached.png.

Executable: D:\git\axiom\artifacts\electron-20260919T022114Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Full workspace autosave

Axiom saves the complete session every 30 seconds and saves again before closing or changing workspaces. Named .axiom files update automatically. Unnamed workspaces retain session recovery and a separate archived workspace on close or switch, accessible from Recent. Ontology data, graph positions, cluster and radial guides, pins, edge routes, visibility, node admission settings, styles, camera, selection, pane layout and window bounds are retained. Existing imported source files remain separate.

Source and unfinished grid drafts are serialized separately and restored without applying them. Stale source drafts remain stale after restart. Manual workspace Save still commits complete grid edits. Saves are serialized, including a Save as requested while another save is running. Recovery precedes the named-file write; an unsuccessful final save keeps the window open with an error audit. Startup no longer reapplies unchanged graph settings and moves saved nodes. Capture resets the draft epoch synchronously to keep drafts with their own ontology when switching workspaces.

Validation: 36 domain checks and 19 distinct packaged desktop checks passed across the save, startup and source suites. The final executable passed all nine autosave journeys, including the 30-second checkpoint followed by forced exit, exact graph restoration, unnamed recovery, entity and whole-source drafts, stale drafts, incomplete rows, failed destination recovery, overlapping Save as, and workspace isolation. TypeScript, formatting and scoped whitespace checks passed. All 38 packaged runtime files match the build.

Records: artifacts/autosave-unit.json, artifacts/autosave-packaged.json, artifacts/autosave-final-packaged.json and artifacts/autosave-package-check.json.

Executable: D:\git\axiom\artifacts\electron-20260919T025252Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Find Synonyms

Suggest > Find Synonyms is available from Graph and Hierarchy in the shared Suggestions view. It sends the selected entity, hierarchy context and existing rdfs:seeAlso text and links. Children, descendants and siblings are each sampled to 20 entries; up to 20 additional annotated relatives supply omitted seeAlso context. The prompt asks for close wording variants and excludes sibling, broader, narrower and related concepts.

A cached ontology-wide name and alias index checks collisions, including word order and ordinary inflections. A conservative lexical filter rejects loose substitutions. Exclusions retain reasons in the run history. Only reviewed values become rdfs:seeAlso string literals, with Undo and revalidation before adding. Exact prompts, contexts and outcomes persist across restarts. Built-in settings remain separate from custom suggestion definitions.

Testing also exposed a close request lost during workspace opening. Axiom now waits for the workspace operation, saves, and closes. The older restore test now opens a separate snapshot because opening autosaves the active file.

Validation: 65 unit checks and 10 packaged desktop journeys passed. Desktop checks include both menus, scoped progress, context inspection, exclusions, literal edits and Undo, history after restart, independent views, new runs, stale sibling aliases, existing custom and parent suggestions, accessibility, close during opening and failed-save recovery. Assistant responses were mocked; no live assistant was invoked. TypeScript, formatting and scoped whitespace checks passed. All 38 packaged runtime files match the build.

Records: artifacts/synonyms-unit.json, artifacts/synonyms-final-packaged.json and artifacts/synonyms-package-check.json. Screenshot: artifacts/testing/synonyms-review.png.

Executable: D:\git\axiom\artifacts\electron-20260919T035603Z\Axiom-win32-x64\Axiom.exe

## 2026-09-18: Taxonomy drag-and-drop moves

Dragging a class onto another class changes its rdfs:subClassOf assertion. The move replaces the dragged branch and preserves other parents, descendants, instances, annotations, restrictions and equivalent-class definitions. A definition-derived branch gains an explicit subclass assertion. The drop target becomes the preferred visible parent. Details, Source and graph views refresh from the same RDF change; one Undo restores the prior relationships and graph state.

Destinations highlight during dragging, collapsed targets expand on hover, and dragging near the tree edges scrolls long taxonomies. Dropping into empty tree space moves the class under owl:Thing. Self-parenting, descendant cycles, stale drags and moving owl:Thing are rejected. Existing drag-to-Details navigation still works.

Validation: 18 unit checks and all 15 focused packaged desktop journeys passed. Coverage includes native drag gestures, multiple parents, equivalent definitions, graph and Details synchronization, Undo/Redo, saved workspace restart, hover expansion, edge scrolling and cancellation, named graph provenance, invalid drops, accessibility and existing ancestry navigation. The first broader run exposed a transient Details rapid-edit failure; the earlier package and repeated current-package runs passed without changing editor code. A scrolling fixture initially used a worker-only operation and was corrected to open its test file through File Open. TypeScript, formatting and scoped whitespace checks passed. All 38 packaged runtime files match the build. The move screenshot was visually inspected.

Records: artifacts/taxonomy-move-unit.json, artifacts/taxonomy-move-final-packaged.json and artifacts/taxonomy-move-package-check.json. Screenshot: artifacts/testing/taxonomy-move.png.

Executable: D:\git\axiom\artifacts\electron-20260919T041414Z\Axiom-win32-x64\Axiom.exe

## 2026-09-19: Local taxonomy sparsity analysis

Hierarchy's class context menu now offers Analyze sparsity. Findings open in the dockable Sparsity pane, also available from View. Analysis can start at any class or cover the whole taxonomy. It compares each branch with its siblings, using direct child deficits as the main signal and discounted descendants at levels two through four as context. The 80/20 weights and threshold are documented application choices informed by Lemant et al. (2022) on tree balance and Neher et al. (2014) on local branching. The report treats a high score as a review signal.

The pane provides ranked findings, comparison bars, peer counts and means, leaf and text filters, score threshold and descendant influence controls, and paged results. Findings navigate to Hierarchy and Details. Scope and options survive pane closure and workspace restart. Measures are cached per store revision and refresh after edits or Undo. Analysis uses local RDF hierarchy data and makes no ontology edits or assistant requests. Shared descendants count once per branch. Cycle-containing branches are excluded with visible counts.

Validation: 30 unit checks and all nine packaged desktop journeys passed. Unit coverage includes the five-versus-one example, scope isolation, depth discounting, multiple inheritance, cycles, projected definitions, read-only behavior, edits and Undo, a 2,000-level chain, and 15,000 classes. Desktop coverage includes both menu entry points, explanation accuracy, keyboard controls, filters, live refresh, navigation, persisted scope, new-workspace isolation, paging, detached panes and accessibility in light and dark themes. Testing caught a missing-target case after creating a workspace; the pane now returns to its empty state. Electron accessibility checks use the supported legacy runner. TypeScript, formatting and scoped whitespace checks passed. All 38 packaged runtime files match the build. Both report screenshots were visually inspected.

Method and references: docs/sparsity-analysis.md. Records: artifacts/sparsity-unit-final.json, artifacts/sparsity-packaged.json and artifacts/sparsity-package-check.json. Screenshots: artifacts/testing/sparsity-report.png and artifacts/testing/sparsity-detached.png.

Executable: D:\git\axiom\artifacts\electron-20260920T012025Z\Axiom-win32-x64\Axiom.exe

## 2026-09-19: Start ready suggestions on selection

Selecting Add Children, Add Parents, Find Synonyms, Find Instances or a saved custom suggestion now starts its run automatically. Switching suggestion types and saving a completed definition also start the selected suggestion. Define New remains an editor until saved. Results still require review and explicit application.

Reopening a pane, cloning a view, restoring a workspace and browsing history do not start another run. Repeated selection of an active request reuses it. A different selected request waits for its runner, then starts automatically. Pending starts live only in memory and are cleared when the workspace changes. Browsing history cancels a pending start for that pane.

Validation: TypeScript, whitespace checks and all ten scheduling tests passed. All 26 focused desktop cases passed across the initial suite and queue follow-up, using isolated profiles and mocked assistants. The initial queue test timed out after five seconds while its second deliberately slow mock was running; allowing time for both runs resolved the test without a runtime change. Six core journeys also passed against the packaged executable: saved custom suggestions, graph synonyms, queued parents, queued children with duplicate clicks, detached Hierarchy and restored history. Existing review, cancellation, audit, context sampling, Undo and accessibility checks passed. No live assistant requests were made. All 38 packaged runtime files match the build.

Records: artifacts/suggestion-starts-unit.json, artifacts/suggestion-autostart-desktop.json, artifacts/suggestion-autostart-queue.json, artifacts/suggestion-autostart-packaged.json and artifacts/suggestion-autostart-package-check.json.

Executable: D:\git\axiom\artifacts\electron-20260920T013904Z\Axiom-win32-x64\Axiom.exe

## 2026-09-21: Faceted cosine search

Find now offers cosine similarity in the quick dialog and dockable results pane. A typed query is compared with indexed entity values without requiring an existing entity. Type checkboxes independently select classes, instances, properties and other entities. Field checkboxes expose names, aliases, IRIs and all populated RDF predicates, including custom and generated instance fields. Results show scores and the matching field value, with a minimum-score slider, paging and existing navigation actions. Hierarchy and Graph node menus also offer Find similar, excluding the source entity.

The reusable text index uses normalized TF-IDF vectors over word and within-word character-trigram features. Queries visit shared-feature postings and use the same weighting and normalization as indexed values. Unknown query features remain in the norm. Entity scoring takes the maximum matching value; indexes and ranked results are cached by field selection and dataset revision. Search is local and read-only. Method details and sources are in docs/find-similarity.md.

Validation: TypeScript, whitespace checks and 22 focused unit tests passed. Coverage includes previously unseen queries, exact normalized cosine, word order, Unicode, empty vectors, unknown features, every predicate, generated instance values, class/instance facets, thresholds, edits, Undo and complete paging over 15,000 classes. Existing 100,000-class type-ahead coverage also passed. All eight packaged desktop journeys passed, covering quick Find, focus and shortcuts, field selection, score display, filtering, graph and taxonomy actions, restart persistence, detached panes and accessibility. The first desktop run exposed test selectors that also matched the new mode dropdown; selectors now target the result listbox. Visual inspection prompted a facet sidebar and compact narrow-pane layout to preserve result space. The packaged screenshot was inspected. All 38 packaged runtime files match the build. No model or network requests occur during searches.

Records: artifacts/cosine-find-unit.json, artifacts/cosine-find-packaged.json and artifacts/cosine-find-package-check.json. Screenshot: artifacts/testing/find-cosine.png.

Executable: D:\git\axiom\artifacts\electron-20260921T155458Z\Axiom-win32-x64\Axiom.exe

## 2026-09-21: Find results with shared ancestry

Find now opens the complete filtered result set in a separate graph tab. Pagination does not limit the exported results. A breadth-first traversal includes unique ancestors through every parent path to the recorded roots, including instance types and property ancestry. Equivalent intersections preserve their original relationships. Graphs open radially around their roots; existing graphs and Find state are preserved. Results exceeding the graph node limit are rejected before any view changes.

Validation: TypeScript and 16 focused unit tests passed, covering all pages, cosine thresholds, fields and type facets, multiple roots, shared ancestors, cycles, equivalent intersections, generated instances, a 1,100-class ancestor chain and limit refusal. All ten packaged Find desktop tests passed, including repeated new tabs, unchanged original graph geometry, instance ancestry, empty results and workspace restart. A repeated-opening test found a snapshot timing race that could return focus to the previous graph. The action now loads the new graph snapshot before opening its tab and lets that canvas fit itself. Visual inspection prompted the radial default for broad result sets. All 38 packaged runtime files match the build.

Records: artifacts/find-graph-unit.json, artifacts/find-graph-packaged.json and artifacts/find-graph-package-check.json. Screenshots: artifacts/testing/find-open-results.png and artifacts/testing/find-results-ancestry.png.

Executable: D:\git\axiom\artifacts\electron-20260921T184719Z\Axiom-win32-x64\Axiom.exe

## 2026-09-21: Saved tab names and workspace history

Tabs support inline renaming by double-click and a Rename tab context action. View > Tab History groups retained tabs by type, creation date and name, with filtering and open/closed status. Selecting an entry activates or restores the tab. Edit > Settings > Tab history defaults to named tabs only; all-tabs mode also retains numbered default names. The policy stays in Axiom settings, while entries and numbering belong to each workspace. Existing saved entries survive policy changes.

Closed graphs are archived in the workspace and release their live graph slot. Restoring a graph recovers its positions, layout settings, camera and visibility controls. Find tabs recover their query and facets. History participates in workspace autosave and saving on close. Opening and switching workspaces preserve the correct history.

Validation: TypeScript, formatting and whitespace checks passed, along with 22 unit tests. All 28 packaged desktop tests passed across tab history, Find, graph zoom and workspace autosave. The five history tests passed again against the final executable after correcting activation of an already open graph and preservation of Details metadata. Coverage includes both rename methods, default retention, eighteen successive closed graphs, restart restoration, workspace isolation, policy persistence and accessibility. Testing also caught a pane-placement problem after closing the last graph and a restart graph-ID collision; both are fixed. The history screenshot was visually inspected. All 38 packaged runtime files match the build.

Records: artifacts/tab-history-unit.json, artifacts/tab-history-packaged.json, artifacts/tab-history-final-packaged.json and artifacts/tab-history-package-check.json. Screenshot: artifacts/testing/tab-history.png. Usage: docs/tab-history.md.

Executable: D:\git\axiom\artifacts\electron-20260921T210417Z\Axiom-win32-x64\Axiom.exe

## 2026-09-23: Opening .axiom files from the desktop

Axiom opens a workspace or ontology path given at launch. Windows and Linux deliver it in argv, macOS through open-file, and a second launch through second-instance under a single-instance lock, which keeps one Axiom per profile. The argv parser matches the extensions File > Open accepts rather than argument position, because a development run carries the application directory and a handover carries --source-app-id with the application id, which itself ends in .axiom. A launch path skips the pre-save view capture, since the workbench has not mounted and no listener would answer it, while the recovery archive still runs. A missing path is recorded in the error log instead of a modal over an empty window.

scripts/register-file-type.ps1 writes an Axiom.Workspace ProgID and the .axiom entry under the per-user class root, with an icon, a command line quoting %1, and a removal switch. It refuses a directory with no Axiom.exe and rewrites existing entries when Axiom moves.

Validation: TypeScript, formatting and 2254 unit tests passed, including ten parser tests covering the switch-value collision, the development application directory, mixed switches and unopenable extensions. Seven registration tests drive the script through powershell.exe against a scratch class root per run, asserting the command line, icon, ProgID, content type, repointing, removal and both refusals, then deleting the scratch root. Four desktop tests launch the real application with a workspace path, an ontology path, a path handed to a running instance from a plain process, and a path that does not exist. The 34 ontology lifecycle and session startup desktop tests passed unchanged.

Records: docs/file-association.md. Screenshot: artifacts/testing/launch-workspace.png.

## 2026-09-23: Windows installer

npm run package now builds Axiom-Setup-<version>.exe with electron-builder and an NSIS target, alongside the unpacked application the desktop tests run against. The installer installs for the current account into %LOCALAPPDATA%\Programs\Axiom without an elevation prompt, adds Start menu, desktop and Apps and features entries, and registers the .axiom type from build/installer.nsh under HKEY_CURRENT_USER\Software\Classes. The custom include exists because electron-builder emits its own file associations only for a per-machine install. Uninstalling removes the application, the shortcuts and the ProgID, and leaves the extension Default value in place as Microsoft's guidance requires. Updates come from GitHub Releases through electron-updater, downloading in the background and installing on quit. Azure signing configuration is present and switches on from environment variables; builds are unsigned until a certificate exists.

Validation: TypeScript, formatting and 2262 unit tests passed, including eight that hold the installer configuration to per-user install, the application identifier the main process sets, the registry layout of both NSIS macros, shell notification on install and uninstall, and signing that stays off without an endpoint. The four launch desktop tests passed against the electron-builder output. A full install, association check, double-click and silent uninstall ran on Windows: the installer exited 0 without elevation, HKCU carried the ProgID and extension keys, the Start menu shortcut and the Apps and features entry appeared, double-clicking a workspace opened it in the installed copy, and uninstalling removed the ProgID and every artifact while leaving the extension Default value behind.

Records: docs/installation.md. Retired: scripts/register-file-type.ps1 and its test, replaced by the installer.
