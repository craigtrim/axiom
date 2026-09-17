# Implementation decisions

The user authorized a complete Electron rewrite and archival of the previous application on 12 September 2026. Electron and TypeScript are the sole active implementation.

## Desktop architecture

Electron owns the Windows frame, menu bar, native file dialogs, clipboard and application lifecycle. React and FlexLayout provide the movable workbench. Monaco supplies the query editor; AG Grid Community supplies the virtualized tables. The application uses no paid grid features.

The main process handles operating-system integration. A Node worker thread owns the Store, query engine and graph simulation. The sandboxed renderer receives bounded table and query pages and graph snapshots over a typed, allowlisted bridge. It has no Node.js access. Documents are parsed and validated as data; application resources come from the local app protocol. Arbitrary navigation, popup destinations and permission requests are blocked.

The build uses esbuild and Electron Packager. The renderer is minified, with Monaco loaded when the query pane is first opened. This replaces the research proposal's Forge/Webpack build tooling without changing the desktop architecture. Native menus and docking are implemented and exercised in the desktop tests.

## Preserved specification resolutions

The corrected triple count includes the 140 flattened restriction triples: 7,629 / 87,379 / 362,879 / 725,379. The original fixture counts that omit those triples are superseded by STORE-62 and DEF-14.

A budget reduction below the number of pinned or focused nodes is rejected. Protected nodes are retained and the required minimum is reported. This resolves the conflicting over-budget and strict-ceiling requirements as the native implementation did.

Unbound FILTER operands do not pass. Fractional LIMIT values truncate toward zero; negative values are rejected. The first example uses rdfs:subClassOf for NamedPizza. Multi-root radial placement, opposite-direction parallel routes, export-caption width and the 9,000-pixel raster guard retain their corrected behavior.

The Electron regression suite additionally found asymmetric schema adjacency. Reverse type, inverse and disjoint relationships now participate in neighbour accounting. The demo Order grouping edge is represented at both endpoints. This keeps degree, visible degree and held-back counts consistent across arbitrary admissions.

The user requested an exact configurable visible-node limit. It accepts any integer from 100 to 3,000, with 1,000 as the initial default, and is remembered across sessions. This supersedes the previous 100-node increments. Reducing the limit evicts eligible nodes; increasing it creates capacity for deliberate expansion without automatically filling the graph. Dataset size remains independent of display membership.

## Persistence and process boundaries

Persistent layouts and .axiom workspace documents are additions required by the replacement desktop shell. They supersede the old exclusion of preference and window-layout persistence. Workspace saving uses a temporary file and rename; settings retain a backup. A malformed document is rejected before the live Store is replaced.

Renderer rows are snapshots of records owned by the worker. Edits use validated commands and produce a new Store version. This replaces the old requirement for direct UI-thread object references. Queries retain an immutable view of the submitted dataset, and later edits are shown as stale-result state.

Graph drawing shares scene geometry across WebGL2, Canvas and SVG. The screen uses bounded GPU triangle buffers, shader-based dashed lines and a shared text atlas, with Canvas as the fallback and raster-export renderer. Text measurement is cached. The worker advances physics independently of rendering, while reduced-motion mode publishes the settled layout.

## New ontologies and menu behavior

File > New workspace creates an empty ontology rooted at owl:Thing. New classes receive both an owl:Class declaration and their superclass assertion. Named individuals use the selected class, appear in the Individuals table, and participate in queries and graph traversal. File > Open > Examples > Pizza is the separate entry point for generated demo data.

Workspace documents carry the ontology name, namespace and example flag. Older documents without this metadata retain the Pizza interpretation. Open accepts every supported integer node limit, including values such as 357. Creating or opening an ontology clears previous query results and stops any active query.

Native menu availability follows the selected entity, graph membership, query state and active pane. View commands restore visibility and focus, including when another pane is maximised. Graph commands reach detached graph panes, and pane width commands adjust a horizontal split. Reset pane layout returns detached windows to the main workbench.

## Inline entity renaming

Rename edits the name at the selected entity's location. Keyboard and native-menu commands prefer the focused pane; context menus retain their originating pane. If no visible label is available, the inspector opens with its heading ready to edit. The same editor works in detached windows.

Enter saves and restores focus to the surrounding control. Escape cancels, and leaving the field commits a valid name without moving focus back. Text editing remains local to the input. Store validation reports errors beside the field, and successful changes participate in the existing Undo and Redo history. A dataset epoch prevents a delayed rename from changing a replacement workspace.

## Release scope

The packaged application is portable Windows x64 and contains Electron's runtime. The repository has one active build path. The archived .NET projects cannot participate in builds or CI.

The local package is unsigned. No signing identity is included in this repository. A clean Windows 11 installation and measurements on the provisional minimum hardware require an external validation environment.

The original performance and accessibility requirements remain reference targets. The verification record reports gaps explicitly; measured draw submission time is not interchangeable with displayed frame interval or minimum-hardware certification.

## Graph styles, layout workers and research

The September 13 checklist adds a sixth, dockable Research pane and a validated CSS subset for the graph. The renderer and export paths share the same style rules. Taxonomy branch expansion is separate from explicit graph navigation.

ELK layered, stress and tree layouts run in a disposable worker, with cancellation and a 30-second deadline. Circular layout joins the existing in-process algorithms. All algorithms receive only the admitted graph and retain its configured ceiling. Pins remain fixed when worker results are applied. [Graph editing and contextual research](graph-and-research.md) records the algorithm sources and usage.

A unified session history records data commands and graph frames, with renderer-owned state restored through typed events. It groups a drag into one operation, keeps native text and Monaco editing local to their editors, and resets on workspace replacement. An estimated memory budget bounds retained history.

Codex and Claude adapters discover installed commands, pass prompts over stdin and parse structured results. They run as cancellable child processes from temporary application directories. The renderer can request ontology context, run research and open validated HTTPS sources through explicit bridge methods. Model suggestions enter the Store only after review and complete batch validation. A Store version and dataset epoch prevent stale suggestions from being applied to changed data.

Automatic workbench arrangement depends on the available viewport width and aspect ratio. Manual pane changes switch to a custom arrangement, preserving user placement during subsequent resizes.

## Keyboard command registry

Application menus, direct shortcuts, the palette and the keyboard editor share one command registry. Electron displays the configured accelerator while the renderer resolves application and pane scopes, including two-stroke chords. Default text-editing shortcuts remain local to the focused control to avoid asynchronous selection races. Detached panes use the owning workbench's bridge and keyboard settings.

The editor saves versioned personal overrides after conflict validation. Keyboard preferences are excluded from workspace exports and preserved when opening a workspace. Context menus and dialogs have local access letters and suspend application menus while active. F10 explicitly opens an Electron application-menu popup; Alt uses the menu bar. [Windows keyboard conventions](../specs/electron/windows-keyboard-conventions.md) records the Microsoft and Electron evidence, choices and full default command catalog.

## Inline authoring, RDF and export

Classes and properties are created inline in the taxonomy. Double-clicking blank graph space immediately creates a class with a distinct default name selected in the inline editor. Enter or blur saves the name; Escape or an empty field retains the default. The node stays at the clicked position. The graph toolbar, context menus and Insert offer anchored forms for choosing the entity kind and relationship. Creation never exceeds the configured node limit; refusal leaves the ontology unchanged. Human labels are stored as rdfs:label, with unique generated IRIs. Rename preserves the selected label's language and named graph.

Graph edges have a shared selection, hit testing, inspector, keyboard navigation and context menu. Relationship edits change one asserted statement atomically and preserve its named graph; optimistic version checks reject stale drafts. Endpoint reconnection admits any new visible endpoint within the configured budget. Manual bend coordinates belong to the workspace, survive graph refreshes, and participate in Undo and exports. A line that summarizes an axiom or generated data remains selectable and routable, with its semantic editing limit shown in the inspector.

Entity documents expose all asserted statements and retain drafts when their tabs close. Apply and workspace Save check for conflicting entity changes. Imported RDF uses established parsers, retains language/datatype/blank-node/named-graph information, and avoids invented inferred statements. The generated Pizza example retains its established technical IRIs; default identifiers on newly authored entities can follow their labels. Export and reimport the example as RDF to change its established identifiers.

Export is a single preview dialog with diagram and report modes. Raster scale, lossy quality, transparency and PDF page settings appear where relevant. Vector and structured formats have no misleading raster controls. PDF rendering uses an isolated hidden Electron window; reports contain the selected scope's assertions rather than only a screenshot.

Filesystem collection runs in a separate worker with native Windows and ExifTool helpers. It retains raw evidence and queryable fields, including unavailable-source diagnostics. PROV describes files, directory membership, the actual collection activity and metadata observations. Owners, author fields and source timestamps remain evidence rather than invented historical attribution. Existing USN journal records are filtered to observed file IDs; unavailable journals and read limits remain visible. The current output directory is excluded from traversal to avoid collecting files while this operation writes them.

The [research artifact](../specs/electron/authoring-export-provenance-research.md) records Microsoft precedents, implementation choices, metadata coverage and tradeoffs.

The entity inspector exposes the identifier name, display label, comment and applicable relationships. It shares retained drafts with the full details tab, preserves assertion metadata and checks for conflicts before applying. Identifier edits retarget resource references and manual edge routes. Single-click graph label editing uses the rectangles of rendered labels, including stylesheet sizing and collision suppression; node shapes retain selection and dragging.

Creation, default-name promotion and editor previews share the identifier normalizer in rdf-model.ts. Anchored placeholder patterns such as NewClass, NewNode and numbered variants qualify by spelling; established names remain stable on relabeling. A meaningful label replaces the placeholder within its existing namespace, with a numeric suffix when needed. Existing saved mismatches appear as repair drafts in the inspector and are included in Apply or workspace Save. Retargeting preserves graph positions, routes and RDF references, and rebases retained drafts on the changed identifiers.

## Local agent query composition

SPARQL execution uses Comunica over an N3 RDF/JS dataset in a separate, cancellable worker. Traqula supplies the complete SPARQL 1.1 parser and lexer. Formatting preserves the token sequence, literal spelling and comments, validates both documents, and uses Monaco's undo history. The W3C local query corpus executes both before and after formatting.

The pinned engine needs narrow compatibility rules for GRAPH variable scope, REDUCED term identity, literal inspection and URI encoding. These rules are isolated in query-graphs.ts and query-compat.ts and covered by conformance cases. They must be reviewed when upgrading Comunica. Results are capped after query evaluation, so a display cap never limits the input to COUNT or other aggregates. The query panel accepts SELECT, ASK, CONSTRUCT and DESCRIBE; the isolated backend also receives local SPARQL Update conformance tests. Remote retrieval and inferred entailment are not enabled. See [SPARQL testing](sparql-testing.md) for the scope inventory.

A shared local subprocess runner serves entity research and query generation. Query composition uses bounded ontology context, structured output, runtime extraction and local parser/identifier checks. Generated SPARQL becomes a new query document in the main editor, retaining its source. Run remains explicit. The CLI path uses existing sign-in and contains no direct model API integration.

The [SPARQL authoring research](sparql-agent-integration.md) documents the alternatives and source assessment. Public endpoint-specific skills are reference material, not automatically installed instructions.

Engine choice remains replaceable. If the external evaluator cannot meet Axiom's correctness, language coverage or performance requirements, a custom evaluation engine is an available design option. The shared conformance corpus should remain the acceptance boundary when comparing replacements. The current dependency choice does not make its limitations product requirements.


Query documents use persistent creation order and a separate query-history.json file. Paging and creating from an older query never truncate newer documents. The worker caches results by query identity, while retained text survives result eviction and restart. The [query-history decision record](query-history-ux.md) explains responsive layouts, storage limits and the asynchronous delivery policy.
