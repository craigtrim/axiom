# Text Analysis validation

The current Mutatoc 0.3.1 upgrade is recorded in [verification](verification.md#mutatoc-031-upgrade-october-1-2026). Performance measurements from earlier versions are reported separately in [Text Analysis performance](text-analysis-performance.md).

## Historical validation: Mutatoc 0.2.1

The Windows implementation described below was validated on September 27, 2026 with mutatoc 0.2.1. Its model annotations and Python runtime describe that earlier build.

| Check                                      | Result                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| TypeScript typecheck and application build | Passed                                                                              |
| Complete domain suite                      | 2,606 tests passed across 65 files                                                  |
| Dedicated Text Analysis suite              | 310 passed, including 168 original Python reference cases                           |
| Text Analysis desktop journeys             | 23 passed                                                                           |
| Packaged application journeys              | 23 passed with PATH restricted to Windows System32 and runtime overrides cleared    |
| Packaged application code                  | All 46 JavaScript, CSS, HTML and JSON build files match the final application build |
| Runtime package verification               | The packaging setup verifies the complete mutatoc checksum manifest                 |

The new long-document cases verify all 300 ontology matches and source offsets through edits in the service, and all 240 matches through paste and edits in the desktop view.

The desktop journeys cover automatic typing and paste analysis, background-only highlights, light/dark accessibility, blank workspaces, unsaved ontology changes, restart, ontology switching, plus-span distance boundaries and nested source selection. The inspection journeys verify that highlights and summary entries open the existing editable Details view, with no Details tab inside Text Entities. They cover keyboard access, editing an ontology comment through that view, switching entities, reopening a closed view, reusing detached Details, ambiguous canonical names and model annotations without invented ontology links. Existing ancestry graphs, graph preservation and stale graph-request checks remain covered.

Text Entities is a separate dockable view that opens with Text Analysis. The journeys cover moving and resizing it with the workbench controls, closing and reopening either view independently, restoring layout after restart, and showing entity details without a dialog. A detached-window journey retains an unfinished class and a nested parent draft, follows later text edits, creates a class under Systems, checks accessibility in the dark theme and reattaches the view. Selection authoring is exercised through the toolbar, Alt+Enter and the editor context menu. The `Electronic Surveillance Systems` journey also checks its suggested parent, description, generated RDF, immediate native highlighting, undo/redo and navigation to an existing duplicate. The parent journeys select Computing and Software independently, add and remove another existing parent, and create a class with a new parent and grandparent. Each level retains its own parents and description. They verify existing-parent reuse, cancellation at different depths, ancestor rejection, stale nested requests, immediate highlighting and one-step undo/redo of the complete addition.

The 41 authoring and pane-preference unit cases cover partial names, synonyms, Unicode normalization, namespace collisions, parent priority, root fallback and alias-cache invalidation after undo/redo. They also check multiple subclass assertions, recursive creation, shared new ancestors in the store operation, unique IRI allocation, atomic undo/redo and preservation of generated example data. Invalid deep parents, repeated new names, existing aliases, object cycles and graph cycles must leave RDF and history unchanged. Parent suggestions are restricted to named classes.

Eleven shared-session unit cases check that two subscribers use one parser request, closing a view retains its result, old entity selections and responses are rejected, draft values survive subscriber changes, and ontology or workspace changes clear the appropriate state. They also cover summary counts, the view's tab-history registration, inspection without discarding a class draft, ambiguous IRI choices and preventing model categories from becoming inferred ontology links.

The ontology-switch journey also passed five consecutive runs after correcting delayed focus so that reopening Text Analysis focuses its editor instead of a toolbar button.

The build recorded in this report is `artifacts/installer-text-details/win-unpacked/Axiom.exe`, with checksums in `artifacts/text-details-validation.json`. The newer [entity editing build](entity-editing-validation.md) repeats all 23 Text Analysis journeys against its packaged executable and adds parent type-ahead, Find navigation and concurrent edit regressions. Its executable is `artifacts/installer-editing-fixes/win-unpacked/Axiom.exe`.

The reference fixtures were generated from original Mutato commit `da6bfa5df80b208a3271e111f2921ad281d0da98`, with LingPatLab 1.1.1, spaCy 3.8.2 and model 3.8.0. Their 168 cases pass through Axiom's RDF loader and live ontology context before calling C. Each ontology match must also resolve to ontology metadata. Explicit positive and negative assertions in the generator verify that each profile exercises its intended matching behavior. See [fixture provenance](../tests/fixtures/text-analysis/README.md).

The dedicated suite requires the native runtime. Its missing-runtime check was exercised and returned exit status 1 before starting tests. Protocol and scheduling tests cover failures, timeouts, late responses, graph versions and queue replacement. Navigation tests cover native canonical identifiers, namespace collisions, shared and multiple ancestors, cycles, individual types, property parents, intersection ancestry, deep hierarchies and graph limits.

A broader run of `tests/e2e/details.spec.ts` produced one pass and nine failures. Running those same tests against the previous executable, `installer-text-parents/win-unpacked/Axiom.exe`, reproduced the same nine failures. Eight fail during fixture setup with an unavailable entity; the remaining failure concerns a restored tab-name expectation. These existing failures are recorded in `artifacts/text-details-baseline.log` and `artifacts/text-details-broader.log`.

An earlier broader run of `tests/e2e/menus.spec.ts` produced 22 passes and 10 failures outside Text Analysis. Those failures concern window-title expectations, Find selectors, graph-tab restoration, workspace cancellation expectations, the menu coverage inventory, saved graph styles, hierarchy rename selectors and graph connection state. That broader desktop suite has not been certified green, and remote CI was not run.

Source and tests remain local working-tree changes. A clean build machine needs the extracted mutatoc package described in [Text Analysis](text-analysis.md) before it can package the application.

The preceding native performance change passed all 961 upstream Mutato tests and four subtests, all ten CTest suites, and all ten suites under Linux AddressSanitizer/UndefinedBehaviorSanitizer. The new exact-window corpus compares 266 complete token results against original Python Mutato. All 19 ontology snapshots preserve values and ordering. Benchmark output and source-span hashes agree across all nine measured warm runs. The bundled dependency names and versions are unchanged from 0.2.0.

The completed application archive was compared against the final build: all 46 code and asset files agree. Every one of the 5,544 bundled runtime files matches its package-manifest checksum. The runtime executable SHA-256 is `63dcf5db88419d920b1c4e4cfc51383d47f768cd755d5c6dd0853b9c32b9e74f`.
