# Graph appearance

Axiom has a CSS-like graph stylesheet. The visual editor is under **Edit > Settings > Graph appearance**; the Graph pane's **Styles** button opens the same editor. **Graph > Edit graph stylesheet** opens its Advanced section directly.

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

Each graph footer has a **Node spacing** slider, from 50% to 300%, with 100% as the default. It changes the distance between nodes for every layout, including within Cluster grid groups. Node sizes and camera zoom stay unchanged. Group frames, radial guides and manual edge bends follow the spacing. Pinned nodes stay fixed.

The slider previews changes while dragging. One drag is one Undo operation; keyboard arrows, Home and End also work. Spacing works while the layout is frozen and remains in effect after Relayout, Expand or Collapse. Each graph tab saves its own value in workspaces and the restored session.

## Edge visibility

**Show edges** is checked by default in each graph footer. Uncheck it to hide relationship lines, arrowheads and labels while keeping every relationship in the ontology and graph layout. Hidden edges cannot be selected on the canvas. Check it again to restore them.

The setting belongs to each graph and is saved with workspaces and sessions. Undo and Redo include visibility changes. Image exports follow the current visibility setting.

## Number badge visibility

**Show counts** is checked by default beside **Show edges** in each graph footer. Uncheck it to hide the +N number badges on graph nodes. These badges count neighbours not currently displayed; hiding them preserves all data and node positions. Hierarchy instance counts remain available.

Each graph saves its own setting in workspaces and restored sessions. Undo and Redo include count visibility changes. PNG and SVG exports use the same visibility setting as the graph.

## Expand max

**Expand max** starts from every node currently visible in the active graph. It follows connections breadth-first, admitting nearer neighbours before more distant nodes, until the Visible node limit is reached or all reachable nodes are visible. It follows connections in either direction and uses the same projected intersection branches as the graph. Disconnected ontology components stay outside the view.

The action fills available slots without evicting existing nodes. Existing nodes keep their positions while new nodes are laid out. One Undo restores the previous map. The button is disabled for empty maps, maps at the limit, and maps with no hidden neighbours. Raising the node limit enables further expansion when more connected nodes remain.
