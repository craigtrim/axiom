# Graph editing and contextual research

Implemented from `things-i-need`: items 1 through 7 and 9. Item 8 is excluded. Item 10 is ignored at Craig's request.

## Graph styles

Open **Graph > Edit graph stylesheet** or use **Styles** in the graph toolbar. The editor accepts a documented CSS subset, validates it before applying, and includes an example and reset button.

```css
node.Class { fill: #4096d8; size: 32px; }
node.Individual { fill: #138873; shape: circle; }
node:selected { stroke: #f59e0b; stroke-width: 3px; }
edge { stroke: #8492a6; opacity: 0.65; }
graph[theme="dark"] { background: #15191e; }
```

Selectors cover entity kinds, exact entity IRIs, exact edge predicates, selection, pins and theme. Rules cascade by specificity and then source order. Shapes, labels, colors, opacity, line width and size are configurable. Colors use hexadecimal notation. The editor lists the supported properties and values; it does not evaluate arbitrary browser CSS.

Styles appear in the live graph and PNG/SVG exports. They are saved in workbench preferences and workspace documents. Applying a stylesheet is undoable. Node size is a visual override; large sizes can overlap in a dense view.

## Connecting nodes

Select a node and use **Connect nodes** in the graph toolbar or node context menu, then click the target. With the graph focused, **C** starts the same operation. You can also drag the selected node's round arrow handle to another node, or click the handle and then the target. Dragging the node itself still moves it.

Connection mode shows the source, target and arrow direction. Its instructions replace the toolbar controls so they do not cover graph nodes. Nodes stay still while you choose a target; force motion and pending layout results resume afterwards. The saved Freeze setting stays unchanged. Pointer targets remain at least 48 pixels across at low zoom, and node labels also accept the connection. Arrow keys and Enter select endpoints without a mouse. **Choose from list** offers all editable entities, including those outside the visible graph. Escape or Cancel leaves the ontology unchanged.

The **Add relationship** dialog confirms From, Relationship and To. It suggests subclass-of between classes, instance-of from an individual to a class, or subproperty-of between properties of the same kind. You can enter another relationship using its IRI or a known prefix. Adding a relationship preserves existing assertions and creates one Undo operation. Duplicate assertions, stale drafts and unavailable graph capacity are rejected before changing the ontology. Any newly displayed endpoint respects the existing graph node limit.

## Edge editing

Click a line to select it, or use the Select edge list in the graph toolbar. Arrow keys move through nodes and edges; E and Shift+E cycle through edges. Enter opens the edge inspector. Shift+F10 opens the selected edge's context menu. These controls also work in detached graph panes.

The edge inspector edits From, Relationship and To. Apply edge changes updates the ontology statement. A relationship can be entered as an absolute IRI or a known prefix such as rdfs:subClassOf. If one visible line represents statements in several named graphs, choose the statement graph before changing or removing it. Changes made elsewhere require Reload edge before applying a draft.

Drag a round endpoint handle onto a node to reconnect it. Activating an endpoint handle and then clicking a node provides the same operation. The From and To fields can choose an entity outside the current graph; it is admitted within the node budget. Removing an edge deletes the chosen asserted relationship and preserves the endpoint nodes. Delete on a selected node continues to remove only the node from the view.

Drag the square middle handle to bend the line. Focus that handle and use arrow keys for keyboard adjustments; Shift makes smaller adjustments. Escape cancels a bend drag. Reset route restores the layout's automatic path. Manual paths are retained in workspace files and used by Fit and image export. Undo and Redo restore relationship edits, routes, graph membership and selection together.

Summarized OWL axioms and generated sample relationships can be selected and rerouted. The inspector explains when they have no individual asserted statement to edit. Their underlying data needs the corresponding axiom or sample-data workflow.

## Taxonomy interactions

Double-click a branch to expand or collapse that branch. It keeps the graph membership unchanged. Right-click any taxonomy row, or focus it and press Shift+F10, for its context menu. The menu offers graph navigation, branch expansion, pins, creation, rename, deletion, copying the IRI and research as applicable to the entity. Disabled actions retain their place in the menu.

**Add children** uses Codex on PATH to propose immediate subclasses grounded in the selected class's ancestry and descendants. **Find instances** uses a distinct prompt for named individuals. Both actions open a review dialog and permit an empty result. See [Taxonomy suggestions](taxonomy-suggestions.md) for context, insertion and test details.

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

The hard visible-node limit remains an exact, configurable integer from 100 to 3,000, starting at 1,000. The layout choice never raises the limit. Reduce the limit when labels and relationships become difficult to read.

## Undo and Redo

Ctrl+Z and Ctrl+Y cover ontology edits, research batches, graph expansion and collapse, removal, pins, node drags, clear, layouts, freeze, node limits, eviction policy and styles. Camera gestures, taxonomy expansion, table filters, theme, prompt edits and manual pane arrangements also enter the workbench history. A node drag is one operation; nearby wheel events form one camera gesture.

Text fields and Monaco retain their own editing history while focused. Click the graph or use the toolbar Undo button to operate on the workbench history. Automatic fitting does not insert a separate operation after graph expansion.

History is session-local and resets when opening a different workspace. It retains up to 100 operations, with a 32 MB estimated budget that evicts older entries while retaining at least the newest operation. Saves, clipboard writes, external browser navigation and completed assistant requests are external effects; Undo changes the workbench and reviewed ontology edits.

## Contextual research

Use **Edit > Research selected entity**, the graph or inspector Research button, a taxonomy context menu, or **View > Research**. The Research pane docks, resizes and detaches like the other panes. Its assistant, template, instructions and web setting appear immediately in every working pane layout. There is no Options button; results remain alongside or below the form.

Axiom detects Codex and Claude on PATH, including the standard Codex npm installation. Refresh assistants after changing an installation. Each provider uses its existing CLI sign-in. Axiom does not install a provider or collect account credentials.

Choose a template for contextual research, synonyms, subclasses, instances or a custom question. Edit its instructions; edits are saved locally. The preview shows the actual prompt and ontology context before transmission. Context includes ontology identity, entity details, parents, children, restrictions, relationships and sample instances, with explicit limits and total counts.

**Run research** sends that context to the chosen provider. Web research can be switched on or off. Separate Wikipedia, DBpedia, ontology and general web buttons open contextual searches in the default browser. Results show the assistant's explanation, source links and suggestions. Select suggestions individually and apply the selected batch. Synonyms become SKOS alternative-label annotations, subclasses are created beneath the researched class, and instances become named individuals of that class. Synonyms appear in the Inspector. The Pizza example's Individuals pane has a selector for its generated orders or named ontology individuals.

Axiom validates the full batch before changing data. It rejects a batch if the ontology changed after the research context was captured. One Undo restores the ontology before an accepted batch.

The adapters follow the documented [Codex noninteractive workflow](https://developers.openai.com/codex/noninteractive/) and [Claude programmatic workflow](https://code.claude.com/docs/en/headless). Requests use stdin, structured output and fixed argument arrays. Codex uses a read-only sandbox with shell tools and delegation disabled. Claude exposes only web research tools when requested, with other tools, external MCP configuration and hooks disabled. Each job runs in a temporary application directory, supports cancellation and has a five-minute timeout.

Installed CLI discovery and help interfaces were checked on this machine. Automated tests run controlled subprocesses through both adapters and exercise suggestion review in Electron. They do not send a paid request to either live model service; account authentication, service availability and model response quality remain dependent on the installed provider.

## Widescreen arrangement

**View > Workbench arrangement** offers Automatic, Standard and Widescreen.

Automatic chooses Widescreen when the application viewport is at least 1,600 CSS pixels wide and its width-to-height ratio is at least 1.7. Individuals and Query then sit beside each other, while the graph gets more of the upper workbench's width. Smaller windows use the standard arrangement.

Dragging a divider or moving a pane makes the arrangement custom so subsequent window resizes preserve that choice. Choose Automatic again, or reset the pane layout, to resume adaptation. The arrangement and manual layout are remembered across restarts.
