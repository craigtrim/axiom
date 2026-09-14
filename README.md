# Axiom Ontology Workbench

Axiom is a Windows desktop application built with Electron and TypeScript. It provides native File/Edit/View menus and a workbench whose panes can be resized, rearranged, grouped, floated and detached into separate windows.

The previous WinUI implementation is preserved in [archive/](archive/README.md). Electron is the only active application.

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

## Work with the ontology

The workbench has Hierarchy, Graph, Inspector, Research, Individuals and Query panes, plus entity document tabs and Filesystem provenance. Drag tabs to reorganize them; drag dividers to resize. Use the Window menu for keyboard alternatives and View to reopen a closed pane. Layout, theme, filters, query text and window bounds are saved locally. Light is the default theme; an existing theme choice is preserved.

File > New workspace creates a blank ontology with Thing as its root. Create classes inline in the taxonomy and enter a human-readable label such as Course Credit. Axiom generates a unique identifier separately. Create named individuals assigned to those classes. The Individuals pane shows their names, classes and IRIs. New workspaces keep your chosen node limit and clear the previous ontology and query results.

The application opens with the Pizza example. File > Open Pizza example returns to it. The fixture provides 95 classes and 14 properties, with 1,000, 12,000, 50,000 or 100,000 deterministic orders. Search finds schema entities, orders and customers. The Individuals table supports filtering, sorting and validated edits to branch, price and rating. Class and individual creation, renaming, class deletion, Undo and Redo update the shared data model.

Press **F2** or choose **Rename** to edit the entity name in place in the hierarchy, graph, inspector or individual table. **Enter** saves, **Escape** cancels, and leaving the field saves a valid name. Validation errors appear beside the field; renaming supports Undo and Redo.

The graph offers Auto, force, hierarchy, radial, cluster-grid, circular, ELK layered, ELK stress and ELK tree layouts, with an exact visible-node limit from 100 to 3,000, pins, expansion, collapse, pan/zoom and a minimap. The starting limit is 1,000 and is remembered between sessions. Choose a smaller limit for a clearer view. Labels avoid overlaps and neighbour badges show what remains available to explore. Double-click empty graph space, use Add entity, or right-click to create a class or instance at that position. Existing node labels edit in place.

Export opens a preview dialog for PNG, JPEG, WebP, TIFF, BMP, SVG, PDF or clipboard output. Choose the diagram area, background, raster scale, quality where supported, title and legend. Ontology reports support multi-page PDF, HTML, Markdown, CSV and JSON, covering the displayed graph or the complete ontology.

Graph > Edit graph stylesheet changes node and edge appearance with validated CSS-like rules. Double-clicking a taxonomy branch expands it, and every taxonomy row has a context menu. Undo and Redo cover graph moves and expansion, styles, settings, pane arrangements and reviewed ontology edits.

The Research pane detects Codex and Claude on PATH. It provides editable prompts for contextual research, synonyms, subclasses and instances, with a preview of the ontology context and review before applying suggestions. View > Workbench arrangement can adapt to widescreen windows or preserve a custom arrangement. See [Graph editing and contextual research](docs/graph-and-research.md) for instructions, algorithm sources and verification limits.

The Monaco query editor provides seven examples and the supported SELECT subset. Results are paged, cancellation is supported, and data changes mark previous results stale. This release operates on asserted data. OWL reasoning and full SPARQL remain outside its scope.

File > Save workspace writes an .axiom document containing ontology edits, generated data and workbench settings. Open validates the document before replacing live data. This is Axiom's workspace format. File > Open or Import also reads RDF/XML, Turtle, N-Triples, N-Quads, TriG and JSON-LD. File > Export ontology writes those formats, retaining named graphs in formats that support them. Remote JSON-LD contexts and implicit OWL import downloads are not used.

Use Edit details, the context menu, or drag a taxonomy row onto the inspector to open a full entity tab beside Graph. Labels, identifiers, comments and all asserted statements are editable. Apply changes commits the entity together; workspace Save also applies retained drafts from closed tabs and checks for conflicting edits.

File > Create provenance from folder collects Windows and embedded metadata in the background. Choose a root, review collection options, and collect. The result includes raw evidence, RDF and coverage diagnostics. Open the result as an ontology, then use the normal graph, editor, query and report features. Reparse targets are not traversed; offline content is optional. Source limitations and denied access are preserved rather than replaced with guessed history. See [authoring, export and provenance research](specs/electron/authoring-export-provenance-research.md).

## Verification

```powershell
npm test
npx playwright test
npm run benchmark
npm run benchmark:desktop
```

The [verification record](docs/verification.md) distinguishes observed results from outstanding acceptance measurements. [Implementation decisions](docs/decisions.md) explain the Electron architecture and carried-forward specification resolutions. The original requirements and rewrite research remain in [specs/](specs/README.md).

## Keyboard commands

Every application menu command has an Alt access path. Open **Edit > Keyboard shortcuts...** with **Alt+E, K** or **Ctrl+Shift+K** to remap command shortcuts and menu letters. The editor supports alternate bindings, pane scopes, two-stroke chords, conflict checks, resets and JSON import/export. Your keyboard settings persist across restarts and remain separate from ontology workspaces.

Use **Ctrl+1** through **Ctrl+6** to open panes, **F6 / Shift+F6** to move between panes, and **Ctrl+Tab / Ctrl+Shift+Tab** to switch tabs in a group. **F1** opens the current shortcut reference. **F10** opens the application menu. The [Microsoft keyboard-conventions research](specs/electron/windows-keyboard-conventions.md) explains the defaults, implementation and customization boundaries.
