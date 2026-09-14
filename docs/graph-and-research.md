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

## Taxonomy interactions

Double-click a branch to expand or collapse that branch. It keeps the graph membership unchanged. Right-click any taxonomy row, or focus it and press Shift+F10, for its context menu. The menu offers graph navigation, branch expansion, pins, creation, rename, deletion, copying the IRI and research as applicable to the entity. Disabled actions retain their place in the menu.

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

Use **Edit > Research selected entity**, the graph or inspector Research button, a taxonomy context menu, or **View > Research**. The Research pane docks, resizes and detaches like the other panes.

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
