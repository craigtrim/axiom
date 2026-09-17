# Graph editing and contextual research

Implemented from `things-i-need`: items 1 through 7 and 9. Item 8 is excluded. Item 10 is ignored at Craig's request.

## Graph styles

Open **Edit > Settings > Graph appearance** or use **Styles** in the graph toolbar for category colors, palettes, and bounded sizing rules. **Graph > Edit graph stylesheet** opens the Advanced section. See [Graph appearance](graph-appearance.md) for the Neo4j research, controls, and sizing definitions.

```css
node.Class { fill: #4096d8; size: 32px; }
node.Individual { fill: #138873; shape: circle; }
node:selected { stroke: #f59e0b; stroke-width: 3px; }
edge { stroke: #8492a6; opacity: 0.65; }
graph[theme="dark"] { background: #15191e; }
```

Selectors cover entity kinds, exact entity IRIs, exact edge predicates, selection, pins and theme. Rules cascade by specificity and then source order. Shapes, labels, colors, opacity, line width and size are configurable. Colors use hexadecimal notation. The editor lists the supported properties and values; it does not evaluate arbitrary browser CSS.

Styles appear in the live graph and PNG/SVG exports. They are saved in workbench preferences and workspace documents. Applying a stylesheet is undoable. Effective node sizes also determine hit testing and layout spacing. Large sizes can still overlap in a dense or frozen view.

## Details

Open **View > Details** (Ctrl+8), use **Details** in an entity context menu or Inspector, or press Alt+Enter for the selected entity. All entry points use one Details pane.

While open, Details follows the selected entity in the graph, hierarchy and other views. Graph clicks update its content without opening a closed pane, activating a background tab or moving focus to a detached window. With no entity selected, Details asks for a selection. Opening and closing the pane remain explicit user actions.

**Back** in the Details action row returns to the previous node or edge. Backspace does the same while focus is in Details, except in text fields, editable content, menus or dialogs. The button is disabled when no previous item is available. Navigation retains up to 100 prior items during the session, survives docking and pane closure, and starts afresh when another ontology is loaded.

Details grid edits apply when a cell loses focus or when Enter finishes a value. Shift+Enter inserts a newline. Predicate dropdown choices apply immediately, and Undo restores the prior value. Incomplete or invalid rows remain editable with validation feedback. Inspector retains its existing Apply changes action. Older saved entity tabs restore as one Details pane in an existing tab location.

## Connecting nodes

Graph gestures follow the selection behavior documented in the [yEd Edit Mode manual](https://yed.yworks.com/support/manual/edit_mode.html). Selection is checked when the mouse button goes down, before the gesture can change it.

| Gesture | Result |
| --- | --- |
| Click a node | Select it. Small square markers identify the selection. |
| Drag an already selected node | Move it. |
| Click empty canvas | Clear the selection. |
| Drag from an unselected node | Draw an edge while the source stays in place. |
| Release over another node | Attach the edge. |
| Release in empty space | Add a bend and continue drawing. Further empty-space clicks add bends; clicking a target finishes. |
| Escape or right-click while drawing | Cancel the unfinished edge. |

The graph toolbar stays available while drawing. A thin arrow follows the pointer and the target receives a small outline. Nodes pause during the gesture; the saved Freeze setting stays unchanged. Target hit areas are at least 48 pixels across at low zoom, and visible node labels also accept drops. Graph seed membership has no selection outline.

Axiom supplies ontology meaning when an edge attaches: class to class creates subclass-of; individual to class creates instance-of; properties of the same kind create subproperty-of. The arrow runs from the child or instance to its parent or type. Other pairs stay attached as a preview while a small property picker asks for the relationship. Details can edit the relationship after creation.

**Graph > Edges**, the command palette and the **C** shortcut retain **Connect nodes** for keyboard use. The node context menu omits it. Arrow keys and Enter choose endpoints. All entry points share the same preview and attachment behavior, including detached panes.

Creation and any drawn bends form one Undo operation. Redo and workspace files restore the route. Existing assertions are preserved. Drawing an existing relationship selects it without adding another assertion. Stale drafts and unavailable graph capacity leave the ontology unchanged. Closing the pane cancels an unfinished connection and releases its temporary layout pause.

## Edge editing

Click a line to select it, or use the Select edge list in the graph toolbar. Arrow keys move through nodes and edges; E and Shift+E cycle through edges. Enter opens Details for the selected edge. Shift+F10 opens the selected edge's context menu. These controls also work in detached graph panes.

The same Details tab follows either a node or an edge selection. Selecting an edge updates an open tab without opening or focusing a closed or background tab. View > Details, the graph Details action, the edge context menu and Alt+Enter explicitly open it.

Details presents node statements in an editable Predicate, Value, Language table. Standard predicates use prefixes; identifiers in the selected entity's namespace use local names. Long values wrap. Add statement appends a row, and each row's menu exposes datatype, named graph, value type and removal.

For edges, Details shows the source above the same compact predicate/value structure. Inspector shares the same retained edge draft; switching between nodes and edges preserves unfinished edits, and Save workspace applies them. Apply edge changes updates the ontology statement. A relationship can be entered as an absolute IRI or a known prefix such as rdfs:subClassOf. If one visible line represents statements in several named graphs, choose the statement graph before changing or removing it. Changes made elsewhere require Reload edge before applying a draft.

Use Reconnect source or Reconnect target in the edge context menu, then click a node to reconnect that end. Selected edges show only the square bend handle. The From and To fields can choose an entity outside the current graph; it is admitted within the node budget. Removing an edge deletes the chosen asserted relationship and preserves the endpoint nodes. Delete on a selected node continues to remove only the node from the view.

Drag the square middle handle to bend the line. Focus that handle and use arrow keys for keyboard adjustments; Shift makes smaller adjustments. Escape cancels a bend drag. Reset route restores the layout's automatic path. Manual paths are retained in workspace files and used by Fit and image export. Undo and Redo restore relationship edits, routes, graph membership and selection together.

Summarized OWL axioms and generated sample relationships can be selected and rerouted. The inspector explains when they have no individual asserted statement to edit. Their underlying data needs the corresponding axiom or sample-data workflow.

## Taxonomy interactions

Double-click a branch to expand or collapse that branch. It keeps the graph membership unchanged. Right-click any taxonomy row, or focus it and press Shift+F10, for its context menu. The menu offers graph navigation, branch expansion, pins, creation, rename, deletion, copying the IRI and research as applicable to the entity. Disabled actions retain their place in the menu.

**Add children** uses the selected local assistant on PATH to propose immediate subclasses grounded in the selected class's ancestry and descendants. **Find instances** uses a distinct prompt for named individuals. Both actions open a review dialog and permit an empty result. See [Taxonomy suggestions](taxonomy-suggestions.md) for context, insertion and test details.

## Layout choices

The graph toolbar, Graph menu and command palette expose the same choices.

| Choice | Intended use |
| --- | --- |
| Auto layout | Select an existing layout based on the visible graph. |
| Force-directed | Explore relationships with spring attraction and repulsion. |
| Hierarchy | Arrange superclass and type relationships by rank. |
| Radial | Inspect neighbours around a focus. |
| Cluster grid | Compare groups of visible entities. |
| Circular | Place visible nodes around a circle in label order. |
| ELK layered (Sugiyama) | Arrange directed graphs in layers and reduce crossings. |
| ELK stress | Arrange nodes using graph distances; useful for inspecting overall structure. |
| ELK tree | Derive a spanning tree and lay out its branches. |

The added algorithms use elkjs 0.12.0. ELK documents its [layered method](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), [stress algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-stress.html) and [Mr. Tree algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-mrtree.html). The [elkjs project](https://github.com/kieler/elkjs) provides the JavaScript implementation.

ELK runs in a separate worker. Cancellation terminates that worker, and a 30-second timeout prevents a layout from running indefinitely. Only currently visible nodes participate. Pinned nodes keep their coordinates when results are applied; this can constrain the appearance of an otherwise automatic layout. Axiom uses the calculated node positions with its own edge renderer.

The graph footer also has a **Node spacing** slider (50% to 300%). It changes distances within clusters for every layout without resizing nodes or changing zoom. Each graph tab remembers its own spacing, including after restart. Pinned nodes stay fixed, and each slider drag is one Undo operation.

The hard visible-node limit remains an exact, configurable integer from 100 to 3,000, starting at 1,000. The layout choice never raises the limit. Reduce the limit when labels and relationships become difficult to read.

## Undo and Redo

Ctrl+Z and Ctrl+Y cover ontology edits, research batches, graph expansion and collapse, removal, pins, node drags, clear, layouts, freeze, node limits, eviction policy and styles. Camera gestures, taxonomy expansion, table filters, theme, prompt edits and manual pane arrangements also enter the workbench history. A node drag is one operation; nearby wheel events form one camera gesture.

Text fields and Monaco retain their own editing history while focused. Click the graph or use the toolbar Undo button to operate on the workbench history. Automatic fitting does not insert a separate operation after graph expansion.

History is session-local and resets when opening a different workspace. It retains up to 100 operations, with a 32 MB estimated budget that evicts older entries while retaining at least the newest operation. Saves, clipboard writes, external browser navigation and completed assistant requests are external effects; Undo changes the workbench and reviewed ontology edits.

## Contextual research

Use **Edit > Research selected entity**, the graph or inspector Research button, a taxonomy context menu, or **View > Research**. The Research pane docks, resizes and detaches like the other panes. Its assistant, template, instructions and web setting appear immediately in every working pane layout. There is no Options button; results remain alongside or below the form.

Claude is the default for Research, query generation, Add children and Find instances. Switching the Assistant selector updates the shared choice across these integrations. Codex remains available. Axiom detects Claude and Codex on PATH, including the standard Codex npm installation. Refresh assistants after changing an installation. Each provider uses its existing CLI sign-in. Axiom does not install a provider or collect account credentials.

Choose a template for contextual research, synonyms, subclasses, instances or a custom question. Edit its instructions; edits are saved locally. The preview shows the actual prompt and ontology context before transmission. Context includes ontology identity, entity details, parents, children, restrictions, relationships and sample instances, with explicit limits and total counts.

**Run research** sends that context to the chosen provider. Web research can be switched on or off. Separate Wikipedia, DBpedia, ontology and general web buttons open contextual searches in the default browser. Results show the assistant's explanation, source links and suggestions. Select suggestions individually and apply the selected batch. Synonyms become SKOS alternative-label annotations, subclasses are created beneath the researched class, and instances become named individuals of that class. Synonyms appear in the Inspector. The Pizza example's Individuals pane has a selector for its generated orders or named ontology individuals.

Axiom validates the full batch before changing data. It rejects a batch if the ontology changed after the research context was captured. One Undo restores the ontology before an accepted batch.

The adapters follow the documented [Codex noninteractive workflow](https://developers.openai.com/codex/noninteractive/) and [Claude programmatic workflow](https://code.claude.com/docs/en/headless). Requests use stdin, structured output and fixed argument arrays. Codex uses a read-only sandbox with shell tools and delegation disabled. Claude exposes only web research tools when requested, with other tools, external MCP configuration and hooks disabled. Each job runs in a temporary application directory, supports cancellation and has a five-minute timeout.

Installed CLI discovery and help interfaces were checked on this machine. Automated tests run controlled subprocesses through both adapters and exercise suggestion review in Electron. They do not send a paid request to either live model service; account authentication, service availability and model response quality remain dependent on the installed provider.

## Widescreen arrangement

**View > Workbench arrangement** offers Automatic, Standard and Widescreen.

Automatic chooses Widescreen when the application viewport is at least 1,600 CSS pixels wide and its width-to-height ratio is at least 1.7. Individuals and Query then sit beside each other, while the graph gets more of the upper workbench's width. Smaller windows use the standard arrangement.

Dragging a divider or moving a pane makes the arrangement custom so subsequent window resizes preserve that choice. Choose Automatic again, or reset the pane layout, to resume adaptation. The arrangement and manual layout are remembered across restarts.

## Multiple graph views

**Show in graph > Current graph** targets the active or last active graph. **New graph** opens an independent graph tab. Each view keeps its nodes, positions, routes, layout and camera; styles remain shared. Workspace files retain the graph views, and Undo restores graph state alongside ontology changes.

**Find in taxonomy** is available in the graph node menu and selection toolbar. It reveals the Hierarchy pane, clears a hiding filter, expands ancestors and scrolls to the selected row. Keyboard focus stays on Graph.

### Details grid and entity source

Details shows Predicate and Value columns. The predicate dropdown includes known relationships, Find predicate and Add predicate. Statement options hold language, datatype and named graph metadata. Open details follows a resource value. Text cells size themselves without resize handles.

The Source disclosure shows the selected entity in the imported document's RDF serialization. New ontologies use Turtle; snippets containing named graphs use a format that preserves them. The snippet includes reachable anonymous structures such as OWL intersections and lists.

Grid edits refresh Source. Source typing remains a separate draft until Save source validates and applies it. A source save updates the grid, graph, taxonomy and Undo history as one operation. Syntax errors and conflicting changes preserve the draft and leave the working ontology intact. Discard source edits reloads the current representation. Source drafts survive navigation and must be saved or discarded explicitly before saving the workspace.

## Expand and Collapse position

Expand and Collapse hold the action node at its exact graph coordinates and screen position. Toolbar reflow is compensated without changing zoom. Other nodes may rearrange around it. The hold applies to force settling, built-in layouts and asynchronous ELK results, without setting the user-controlled Pin flag. Dragging the node or explicitly running a new layout releases the hold.
