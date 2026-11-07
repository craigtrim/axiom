# Graph appearance

Axiom has a CSS-like graph stylesheet. The visual editor is under **Edit > Settings > Graph appearance**; **Graph appearance...** in the graph row's More actions menu opens the same editor. **Graph > Graph stylesheet...** opens its Advanced section directly.

## Research and design

Neo4j Browser styles nodes by label and relationships by type. Its GraSS format provides defaults and more specific overrides, including node color, size, and captions, plus relationship color and width. Axiom keeps its existing stylesheet language and adds a visual editor over the same rules. [Neo4j Browser styling](https://neo4j.com/docs/browser/operations/browser-styling/)

Neo4j's Bloom/Explore legend lists categories and relationship types, with search, counts, and style controls. Its numeric rules can map values to a range of sizes or colors. Axiom adopts the category browser and bounded numeric sizing, then adds weighted combinations of graph metrics. Axiom's displayed catalog counts cover the whole dataset; the Neo4j legend documents counts for its current scene. [Neo4j legend and rule-based styling](https://neo4j.com/docs/aura/explore/explore-visual-tour/legend-panel/)

OWL classes have two roles here: a class can be a node in its own right, and individuals can have that class as their type. The editor offers **The class node**, **Class and all subclasses**, and **Instances of this class**. These produce different selectors. An individual with several types follows the existing CSS cascade: specificity first, then the last matching rule. This differs from Neo4j's category-priority convention and keeps Axiom's visual editor consistent with its stylesheet.

The supplied palettes are Paul Tol's Bright, Muted, and High Contrast qualitative schemes, using his published hexadecimal values and recommended order. They provide coordinated colors designed to remain distinguishable for common forms of color blindness. Category colors repeat after the palette is exhausted; shapes and labels still distinguish categories. These palettes are for categories, not numerical gradients. [Paul Tol's color schemes](https://sronpersonalpages.nl/~pault/)

Color alone must not carry graph meaning. The existing node shapes, captions, selected outlines, and intersection connector captions remain available. A palette's colors do not guarantee sufficient contrast in every combination, particularly after users customize the graph background or opacity. Preview both light and dark backgrounds. [W3C use of color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html), [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## Controls

- **Nodes:** browse node kinds or the same class taxonomy shown in Hierarchy. Expand branches or search by label or identifier; matching results retain their ancestor path. Rows are virtualized for large ontologies. Set fill, shape, caption, and sizing for one class, its whole branch, or its instances.
- **Relationships:** search relationship types, with dataset counts. Set line color, width, and solid or dashed rendering.
- **Sizing:** set the global rule. More specific node rules can override it.
- **Advanced:** edit the existing CSS-like syntax, including text color, font size, outlines, opacity, and light/dark canvas backgrounds.

Palette swatches change the selected category. **Apply palette** assigns explicit colors to all current node kinds or relationship types, in identifier order. Changing the search filter or expanding the graph does not reassign those colors. New categories use inherited styles until customized or included in a later palette application.

The preview uses the graph's renderer. Changes remain local to the dialog until Apply; Cancel leaves the graph unchanged. Apply participates in Undo/Redo and workspace persistence. SVG and PNG exports use the same stylesheet, and effective node sizes are used for hit testing and layout spacing.

## Sizing definitions

| Choice | Meaning |
| --- | --- |
| Axiom default | Existing logarithmic sizing by connections, with different base sizes for node kinds. |
| Fixed size | A constant graph-space diameter. Graph zoom scales it normally. |
| Connections | All graph relationships incident to the node, including relationships outside the visible graph. This includes semantic OWL projections used by the graph. |
| Direct instances | Individuals explicitly assigned to the class, consistent with Show instances. This does not include inferred or subclass instances. |
| Nodes of the same kind | Dataset count of nodes sharing the structural kind, such as Class or Individual. |
| Weighted combination | A weighted average of the normalized connections, instances, and same-kind counts. |

The catalog describes graph-visible resources and semantic graph relationships. Anonymous RDF list cells are excluded. Relationship counts describe the visual graph's projected relationships, so they are not necessarily equal to raw triple counts. Generated example individuals are included, even if none are displayed.

For a metric value x and the maximum M across the dataset, proportional mode uses x/M. Logarithmic mode uses log(1+x)/log(1+M). A zero maximum contributes zero. Scores are bounded to [0,1]. Each metric is normalized separately before weighting, and the result is divided by the sum of its weights. At least one weight must be positive.

For example, connections weight 25 and instances weight 75 give instances three times the influence, regardless of the raw units. The weights need not sum to 100.

Given score s, minimum diameter a, and maximum diameter b, diameter is:

```text
diameter = sqrt(a² + s × (b² - a²))
```

This interpolates glyph area between visible minimum and maximum bounds. It avoids the exaggerated area differences produced by sizing diameter directly from a count. Square-root mappings are a standard quantitative scaling operation. [D3 power and square-root scales](https://d3js.org/d3-scale/pow)

The visible minimum means this is bounded area scaling, not an exact zero-based proportional-symbol chart. Different shapes have different area constants, so quantitative comparisons are best made among nodes of the same shape. The default bounds are 16 and 64 graph pixels; supported sizes range from 6 to 120. Zero or missing values use the minimum. A logarithmic distribution makes smaller counts more visible when a few nodes have very large values.

Maxima are computed across the dataset, not from the currently displayed nodes. Expanding, collapsing, filtering the catalog, and changing selection do not change the scale. Editing or replacing the dataset refreshes counts and maxima. Analysis runs in the domain worker and is cached by store version.

## Stylesheet examples

```css
node {
  size-by: weighted;
  connections-weight: 25;
  instances-weight: 75;
  count-weight: 0;
  size-scale: log;
  size-min: 20;
  size-max: 72;
}
node.Class { fill: #4477aa; }
node[type="http://example.org/ontology#Person"] { fill: #ee6677; }
node[iri="http://example.org/ontology#Person"] { size: 44; }
edge[predicate="http://www.w3.org/2000/01/rdf-schema#subClassOf"] {
  stroke: #aa3377;
  stroke-width: 2;
  line-style: dashed;
}
```

A plain size declaration selects fixed sizing for that rule, preserving existing stylesheets. size-by: auto restores Axiom's default sizing. The editor preserves unrelated rules and comments when changing a selector. Stylesheets retain the existing limits of 50,000 characters and 200 rules.

Future extensions could include named appearance presets, arbitrary RDF-property conditions, and sequential numeric color scales. These are distinct from the implemented count-based sizing and category palettes.

The export legend uses the stylesheet's color and shape when a kind is styled uniformly. When nodes of one kind have different styles, the legend marks that kind as varied rather than assigning a single category color to it.

## Taxonomy branch rules

The class picker and Hierarchy share taxonomy traversal, ordering, markers and instance counts. Choosing Class and all subclasses creates a node[ancestor="IRI"] rule that matches the class and its descendants, including classes added later. Exact node selectors override branch rules. Overlapping branch rules of equal specificity follow source order. The branch choice styles class nodes; instance styling remains a separate option.

## Node spacing

Each graph's Display options flyout has a **Node spacing** slider, from 50% to 300%, with 100% as the default. It changes the distance between nodes for every layout, including within Cluster grid groups. Node sizes and camera zoom stay unchanged. Group frames, radial guides and manual edge bends follow the spacing. Pinned nodes stay fixed.

The slider previews changes while dragging. One drag is one Undo operation; keyboard arrows, Home and End also work. Spacing works while the layout is frozen and remains in effect after Relayout, Expand or Collapse. Each graph tab saves its own value in workspaces and the restored session.

## Center the graph

**Center**, beside Fit in the graph's command row, brings the graph's first remaining starting node to the middle of the canvas at the current zoom. If none of the starting nodes remain, it centres on the visible node with the most visible connections. Selection, node positions and relationships stay unchanged. The action is also available from Graph > Center graph and the command palette. Each graph keeps its own camera, and Center is disabled on empty graphs.

## Label relevance at crowded zoom levels

When labels compete for space, Axiom ranks nodes by total connectivity and direct instance count across the dataset, including connections and instances outside the current graph. The two metrics have equal weight after logarithmic normalization. Highly connected classes remain useful landmarks even in ontologies with no instances. Drawn node size does not affect relevance.

Starting nodes, the selected node, the hovered node and pinned nodes receive priority over automatic rankings. Visible connectivity breaks score ties, followed by a stable identifier order. Moving the pointer away clears hover priority. Zooming in reveals more labels as space becomes available; graph membership, node positions and ontology data stay unchanged.

Relevance scores share the cached dataset analysis used by graph appearance. Ontology edits and Undo/Redo invalidate that index. The renderer caches the label order for each graph snapshot and reuses it during zoom, pan and layout motion. SVG and PNG exports use the same ordering when All node labels is turned off.

## Graph zoom

The mouse wheel and graph zoom shortcuts continue below 5%, so large layouts can be viewed from farther away. Fit frames the entire visible graph regardless of its spread. Zoom stays centred under the pointer for the wheel and at the centre of the canvas for keyboard commands. Each graph restores its saved zoom when the app reopens.

## Edge visibility

**Show edges** is checked by default in each graph's Display options, and in **Graph > Show**. Uncheck it to hide relationship lines, arrowheads and labels while keeping every relationship in the ontology and graph layout. Hidden edges cannot be selected on the canvas. Check it again to restore them.

The setting belongs to each graph and is saved with workspaces and sessions. Undo and Redo include visibility changes. Image exports follow the current visibility setting.

## Label visibility

**Show labels** is checked by default between **Show edges** and **Show counts** in Display options (craigtrim/axiom#187). Uncheck it to hide the name under every node, including the selected node, the hovered node and the node whose right-click menu is open. Nodes keep their positions, and the hierarchy layout still spaces its rows by label width. Relationship captions stay under **Show edges** and the +N badges under **Show counts**; the AND and + marks inside nodes and the Cluster grid group headings do not change. A hidden label is not a click target, while clicks, drags and right-clicks on a node work as before. The graph's screen-reader list keeps every node's name.

Each graph saves its own setting in workspaces and restored sessions. Undo and Redo include label visibility changes. Image exports follow the setting, so an export of a graph with labels hidden has no node labels even when **All node labels** is checked.

## Number badge visibility

**Show counts** is checked by default beside **Show labels** in Display options. Uncheck it to hide the +N number badges on graph nodes. These badges count neighbours not currently displayed; hiding them preserves all data and node positions. Hierarchy instance counts remain available.

Each graph saves its own setting in workspaces and restored sessions. Undo and Redo include count visibility changes. PNG and SVG exports use the same visibility setting as the graph.

## Cluster colors

**Clusters**, directly under **Color clusters** in Display options, controls what counts as a group (craigtrim/axiom#205). At **Strict** (0%), a cluster is an island of displayed nodes connected by relationships, with no relationship to the rest of the displayed graph. At **Loose** (100%), a cluster is a group of nodes that sit together in the layout, whether or not relationships connect them. Positions between the ends gradually give more weight to closeness and less to long relationships. A cluster has at least two nodes; scattered nodes can remain outside every cluster.

The slider starts at 100%, including when opening a workspace saved before it existed. It moves in 5% steps, previews changes at most every 80 ms during a drag, and creates one Undo step per drag or key press. Undo and Redo restore the setting without rewinding or interrupting the layout. Each graph view saves its own value. The slider stays available whenever that graph shows nodes, even while Color clusters is off or disabled. Switching layouts can change the clusters; zooming and panning do not.

**Color clusters** is available while a graph has two or more clusters at its current slider setting (craigtrim/axiom#200). With fewer, the box is disabled, and hovering it explains whether the nodes form one cluster, no nodes group together, or the graph is empty. Moving the Clusters slider can change that count. Screen readers read the same reason. Checking the box fills each cluster's nodes with one color in every layout. Shapes, sizes, labels, edges and selection marks stay as they are, and the + and AND marks stay readable on every cluster color. Nodes outside every cluster turn neutral grey. While the box is checked, cluster colors replace stylesheet fills.

Turning the colors on numbers the clusters by size, largest first. After that a cluster keeps its color as nodes are hidden or shown or the slider moves. When a cluster splits, the part holding most of its nodes keeps the color and the other part takes the first unused one. When clusters merge, the merged cluster keeps the color of the part that held more nodes. **Show edges** hides the lines without changing clusters.

During a force layout, existing nodes keep their previous cluster colors and newly added nodes stay grey until the layout settles. With Color clusters on, the status message says “Clusters update when the layout settles.” A completed layout or a slider change updates the groups.

The colors come from ordered light and dark sequences that start from Petroff's accessible ten-color sequence (research in #184, derivation in #185). Every color keeps 3:1 contrast with its canvas. In the light theme the first 9 colors stay apart under simulated protanopia, deuteranopia and tritanopia, and the first 51 stay apart for normal color vision; the dark theme's figures are 12 and 79. Past the end of a sequence, colors repeat, and a repeated color goes to the cluster farthest on screen from the clusters already using it. [Petroff, Accessible Color Sequences for Data Visualization](https://arxiv.org/abs/2107.02270)

Each graph saves its own setting in workspaces and restored sessions, and Undo and Redo include it. The box is disabled again when the graph joins back into one cluster. It keeps showing the saved setting, so a graph left checked shows a checked, disabled box and colors its clusters again when they return. PNG and SVG exports carry the same colors. The minimap keeps its single color.

## Expand to limit

**Expand to limit** starts from every node currently visible in the active graph. It follows connections breadth-first, admitting nearer neighbors before more distant nodes, until the Visible node limit is reached or all reachable nodes are visible. It follows connections in either direction and uses the same projected intersection branches as the graph. Disconnected ontology components stay outside the view.

The action fills available slots without evicting existing nodes. Existing nodes keep their positions while new nodes are laid out. One Undo restores the previous map. The button, **Graph > Expand to limit** and the command palette entry are disabled for empty maps, maps at the limit, and maps with no hidden neighbors. Raising the node limit enables further expansion when more connected nodes remain.

## Image export size

Export writes a raster diagram at the pixel size the dialog shows, with no Axiom limit (craigtrim/axiom#188). An image that fits one canvas, up to 65,535 pixels per side and 268,435,456 pixels, is drawn whole. PNG, TIFF and BMP images past that are drawn in bands and streamed into the file, so a large export needs disk space rather than memory. An SVG draws the background dot grid as one repeating pattern, so its file size does not grow with the diagram's area. A PDF draws a grid of up to 250,000 dots one dot at a time, so the dots print sharply; a larger grid uses the pattern, which Chromium prints as a 72-dpi image.

Some formats have their own ceiling, and the dialog names it and disables Export when the image passes it: WebP holds up to 16,383 pixels per side, JPEG up to 65,500 pixels per side and 268,435,456 pixels in Axiom, and BMP files up to 4,294,967,295 bytes. The clipboard takes images up to the canvas size. A TIFF past 4 GB is written as BigTIFF, and the dialog notes that some viewers, such as Windows Photos, cannot open it. PNG has no ceiling.
