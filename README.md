# Axiom Ontology Workbench

[![Electron desktop](https://github.com/craigtrim/axiom/actions/workflows/build.yml/badge.svg)](https://github.com/craigtrim/axiom/actions/workflows/build.yml)
![Version](https://img.shields.io/badge/version-1.0.0-informational)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4?logo=windows&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-44.3.0-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19.3.0-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-5FA04E?logo=nodedotjs&logoColor=white)

Axiom is a Windows desktop application built with Electron and TypeScript. It provides native File/Edit/View menus and a workbench whose panes can be resized, rearranged, grouped, floated and detached into separate windows.

The previous WinUI implementation is recorded in [archive/](archive/README.md); its source archive is kept outside version control. Electron is the only active application.

## Run a packaged build

Open the absolute executable path recorded in [artifacts/latest-electron.json](artifacts/latest-electron.json). Keep the executable beside its accompanying DLLs, resources and locales. The complete folder is portable and needs no separate Node.js or .NET installation.

These local packages are unsigned. Signing and validation on a clean Windows 11 machine remain release requirements.

## Develop and build

Use Node.js 22.12 or later on Windows.

```powershell
npm ci
npm start
```

```powershell
npm run verify
npm run package
```

Packaging creates an immutable folder under artifacts/electron-<timestamp>/Axiom-win32-x64 and prints the absolute path to Axiom.exe. The latest build is also recorded in artifacts/latest-electron.json.

To open .axiom files by double-clicking them, copy the packaged folder somewhere permanent and register the extension with scripts/register-file-type.ps1. See docs/file-association.md.

## Work with the ontology

The workbench has Hierarchy, Graph, Inspector, Research, Individuals, Query and Source panes, plus entity document tabs and Filesystem provenance. Drag tabs to reorganize them; drag dividers to resize. Use the Window menu for keyboard alternatives and View to reopen a closed pane. Layout, theme, filters, query text and window bounds are saved locally. Light is the default theme; an existing theme choice is preserved.

File > New workspace creates a blank ontology with Thing as its root. Create classes inline in the taxonomy and enter a human-readable label such as Course Credit. Axiom normalizes that label into a unique identifier, such as CourseCredit. Create named individuals assigned to those classes. The Individuals pane shows their names, classes and IRIs. New workspaces keep your chosen node limit and clear the previous ontology and cached result rows. Saved query references remain available in results tabs.

Axiom reopens the last session, including its ontology, graph views, selection and pane layout. A fresh profile opens an empty workspace with a blank graph. File > Close leaves the next launch empty. File > Open > Examples > Pizza opens the demo explicitly. The fixture provides 95 classes and 14 properties, with 1,000, 12,000, 50,000 or 100,000 deterministic orders. Search finds schema entities, orders and customers. The Individuals table supports filtering, sorting and validated edits to branch, price and rating. Class and individual creation, renaming, class deletion, Undo and Redo update the shared data model.

Press **F2** or choose **Rename** to edit the entity name in place in the hierarchy, graph, inspector or individual table. **Enter** saves, **Escape** cancels, and leaving the field saves a valid name. Validation errors appear beside the field; renaming supports Undo and Redo.

The graph offers Auto, force, hierarchy, radial, cluster-grid, circular, ELK layered, ELK stress and ELK tree layouts, with an exact visible-node limit from 100 to 15,000, pins, expansion, collapse, pan/zoom and a minimap. The starting limit is 1,000 and is remembered between sessions. Choose a smaller limit for a clearer view. Labels avoid overlaps and neighbour badges show what remains available to explore. Double-click empty graph space to create a class at that position with its default name selected for typing. Enter or clicking away saves the name; Escape or leaving it empty keeps the default. Use Add entity or right-click to choose a class or instance and its relationship. Existing node labels edit in place.

Select a graph edge to inspect its source, relationship and target. Drag an endpoint onto another node to reconnect it, or drag the middle handle to bend the line. Remove edge deletes the selected asserted relationship while keeping its nodes. Edge edits and routes support Undo, Redo and workspace Save. The edge inspector distinguishes statements in separate named graphs and explains editing limits for summarized axioms and generated sample links.

Export opens a preview dialog for PNG, JPEG, WebP, TIFF, BMP, SVG, PDF or clipboard output. Choose the diagram area, background, raster scale, quality where supported, title and legend. Ontology reports support multi-page PDF, HTML, Markdown, CSV and JSON, covering the displayed graph or the complete ontology.

Graph > Edit graph stylesheet changes node and edge appearance with validated CSS-like rules. Double-clicking a taxonomy branch expands it, and every taxonomy row has a context menu. Undo and Redo cover graph moves and expansion, styles, settings, pane arrangements and reviewed ontology edits.

Right-click a taxonomy class and choose **Add children** to have Codex propose immediate subclasses using the complete ancestry and existing descendant structure. Review the proposals, select those to add, and undo the batch together if needed. **Find instances** uses a separate prompt and creates named individuals with rdf:type relationships. No new suggestions is an accepted result. See [Taxonomy suggestions](docs/taxonomy-suggestions.md) for context scope and the opt-in real-Codex tests.

Docked views adapt to their available width and height. Narrow side panes prioritize actions and working content; shallow bottom panes use horizontal layouts. Options, More and named disclosures retain access to settings and detail. Graph keeps its visual presentation. See [Adaptive pane layouts](docs/adaptive-pane-ux.md) for the design research and behavior.

The Research pane detects Codex and Claude on PATH. It provides editable prompts for contextual research, synonyms, subclasses and instances, with a preview of the ontology context and review before applying suggestions. View > Workbench arrangement can adapt to widescreen windows or preserve a custom arrangement. See [Graph editing and contextual research](docs/graph-and-research.md) for instructions, algorithm sources and verification limits.

The Monaco editor runs SPARQL 1.1 queries through Comunica: SELECT, ASK, CONSTRUCT and DESCRIBE, including aggregates, OPTIONAL, property paths, subqueries, named graphs and standard functions. Results are paged, cancellation stops a separate query worker, and data changes mark previous results stale. Queries inspect local asserted data; remote SERVICE, ontology updates through the query panel and implicit OWL reasoning are outside this flow.

File > Save workspace writes an .axiom document containing ontology edits, generated data and workbench settings. Open validates the document before replacing live data. This is Axiom's workspace format. File > Open > Workspace (Ctrl+O) or Import also reads RDF/XML, Turtle, N-Triples, N-Quads, TriG and JSON-LD. File > Export ontology writes those formats, retaining named graphs in formats that support them. File > Open > Recent lists the full absolute paths of the last 12 successfully opened or saved files, newest first, and retains the list across restarts. Remote JSON-LD contexts and implicit OWL import downloads are not used.

Edit the selected entity in the right-hand inspector: a default name such as NewClass or NewClass2 follows the first meaningful label through the shared identifier normalizer. For example, Alpha Beta !! Gamma becomes AlphaBetaGamma. Established names remain unchanged when relabeled. Name, Label, Comment and relationship edits apply together with Apply changes. Click a visible graph label once to type in place; Enter or clicking away saves, and Escape cancels. Use Edit details, the context menu, or drag a taxonomy row onto the inspector to open a full entity tab beside Graph. Labels, identifiers, comments and all asserted statements are editable. Apply changes commits the entity together; workspace Save also applies retained drafts from the inspector and closed tabs and checks for conflicting edits. The inspector and full details tab share each entity draft.

View > Source opens the ontology as editable Turtle, RDF/XML (including .owl files), JSON-LD, N-Triples, N-Quads or TriG. Source, graph, taxonomy and entity editors share the same ontology and Undo history. Apply changes, workspace Save and format switching validate pending source edits; invalid or conflicting drafts stay available for correction. The inspector provides Open file, Show in folder and optional image thumbnails for filesystem entities and their metadata observations. See [Source editing and linked files](docs/source-and-files.md) for synchronization, format and cache behavior.

File > Create provenance from folder collects Windows and embedded metadata in the background. Choose a root, review collection options, and collect. The result includes raw evidence, RDF and coverage diagnostics. Open the result as an ontology, then use the normal graph, editor, query and report features. Reparse targets are not traversed; offline content is optional. Source limitations and denied access are preserved rather than replaced with guessed history. See [authoring, export and provenance research](specs/electron/authoring-export-provenance-research.md).

## Verification

```powershell
npm test
npx playwright test
npm run benchmark
npm run benchmark:desktop
```

The local SPARQL suite includes 1,642 checks across W3C conformance, original and formatted queries, and literal regressions. It runs without an agent or network access. Run it alone with `npm run test:sparql`. The separate `npm run test:codex` suite launches the real Codex found on PATH, checks generated queries and taxonomy proposals in Electron, and records its responses. It is excluded from ordinary testing. See [SPARQL testing](docs/sparql-testing.md) for coverage, boundaries and commands.

The [verification record](docs/verification.md) distinguishes observed results from outstanding acceptance measurements. [Implementation decisions](docs/decisions.md) explain the Electron architecture and carried-forward specification resolutions. The original requirements and rewrite research remain in [specs/](specs/README.md).

### Session restoration

The last-session copy is stored in the application profile, separately from ontology and workspace files. It is updated when a workspace is opened or saved and when Axiom closes. Imported ontologies can be resumed even if their original files move. Save, Discard and Cancel retain their existing meanings: discarded edits are not restored on the next launch. Source drafts still require their explicit Save source action.

Session writes are atomic and retain the preceding valid copy for recovery. If neither session copy is usable, Axiom starts empty and reports the restoration failure. Keyboard shortcuts remain global preferences.

## Keyboard commands

Every application menu command has an Alt access path. Open **Edit > Keyboard shortcuts...** with **Alt+E, K** or **Ctrl+Shift+K** to remap command shortcuts and menu letters. The editor supports alternate bindings, pane scopes, two-stroke chords, conflict checks, resets and JSON import/export. Your keyboard settings persist across restarts and remain separate from ontology workspaces.

Use **Ctrl+1** through **Ctrl+7** to open panes, **F6 / Shift+F6** to move between panes, and **Ctrl+Tab / Ctrl+Shift+Tab** to switch tabs in a group. **F1** opens the current shortcut reference. **F10** opens the application menu. The [Microsoft keyboard-conventions research](specs/electron/windows-keyboard-conventions.md) explains the defaults, implementation and customization boundaries.

### SPARQL authoring

In Query, **Format** (Shift+Alt+F) capitalizes keywords and lays out SPARQL queries. It preserves query data and comments, and the change can be undone within that query. Formatting, whitespace, comment edits and keyword capitalization do not mark existing results as stale. Changes to query content or the underlying data still do.

**Compose query** accepts a description and uses Codex or Claude installed on PATH, through the CLI's existing sign-in. Review the context, optionally include the current query for refinement, then generate. The generated SPARQL opens automatically as a new query in the main editor. **Run** executes it separately. If you edit or navigate while generation runs, the current draft stays in place and **Open generated query** appears.

Use **Previous** and **Next** to page through retained queries, **New query** to keep the current one and start another, and the position indicator to search history. Drafts persist across restart. Each execution opens a separate **Query results** workbench tab with its run details and saved SPARQL. **Open query** restores the source; if it has since changed, Axiom creates a copy of the executed query and preserves the newer draft. Closing Query leaves results available. Result rows are cached in memory; after expiry or restart, the saved query remains available for an explicit rerun. The compact composer closes after generation to make room for the editor. Wide panes show the composer beside the editor. See the [query-history UX research](docs/query-history-ux.md) and [agent integration research](docs/sparql-agent-integration.md).
