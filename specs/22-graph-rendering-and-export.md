# Graph Rendering and Export

Defines how the Axiom graph Surface turns node and edge positions into pixels on screen, and how it turns the same Viewport into PNG, SVG and clipboard artefacts that state exactly what is being shown.

**Status:** Normative

**Owned prefix:** `REN`

---

## 1. Scope and boundaries

### 1.1 In scope

This document owns everything downstream of "positions exist":

| Concern | Owned here |
| --- | --- |
| The two-space render model | Yes |
| View transform (pan/zoom), fit-to-view | Yes |
| Draw order and pass structure | Yes |
| Palette acquisition and theme re-read | Yes |
| Device-pixel / backing-store sizing | Yes |
| Node shape, fill, overlays, rings, markers | Yes |
| Edge stroke, routing geometry, arrowheads | Yes |
| Hover emphasis (visual only) | Yes |
| Label placement, measurement, collision, truncation | Yes |
| Hidden-neighbour badges | Yes |
| Cluster titles | Yes |
| Minimap drawing | Yes |
| Hit testing (screen-space geometry) | Yes |
| PNG / SVG / clipboard export | Yes |
| Rendering accessibility and performance | Yes |

### 1.2 Out of scope

**REN-1** This document MUST NOT be read as specifying node admission, Eviction, expansion, the Budget policy, the pointer and keyboard interaction model, or how node coordinates are computed. Those belong to [Graph viewport and budget](20-graph-viewport-and-budget.md) and [Layout algorithms](21-layout-algorithms.md).

**REN-2** The renderer MUST treat the following as read-only inputs supplied by the Viewport and Layout mode subsystems: node positions `x`, `y`; node radius `r`; node `kind`, `label`, `pinned`, `deg`, `shownDeg`; the edge set with `a`, `b`, `pred`, and the multiplicity pair `mi` / `mn`; the resolved Layout mode; cluster frame rectangles; radial ring radii and ring origin; the Focus set; the current selection and hover identifiers `[src: G]`.

**REN-3** Rendering MUST NOT mutate model state. A render pass MUST NOT write to node positions, velocities, `pinned`, `expanded`, `touched`, the edge map, the Focus set, the selection, or the Budget. The only state a render pass MAY write is renderer-local scratch (the palette cache, the backing-store size, and per-frame temporaries). In the reference build every mutation of `G.nodes` happens in the layout or interaction code, never inside `renderScene()` `[src: renderScene()]`.

**REN-4** The one permitted exception to REN-3 is the derived multiplicity index `mi` / `mn`, which is assigned by the layout indexing step, not by the renderer, and is consumed here read-only `[src: indexEdges()]`.

### 1.3 Terminology

Terms **Store**, **TBox**, **ABox**, **Entity**, **Individual**, **Viewport**, **Budget**, **Eviction**, **Focus set**, **Pin**, **Hidden neighbour**, **Surface**, **Layout mode** and **Design token** are used as defined in [README](README.md). `pizza:` denotes the real ontology namespace; `demo:` denotes generated data.

Two further terms are local to this document:

- **World space** — the coordinate system in which node positions and layout geometry are expressed. Units are arbitrary and unbounded; the Layout mode owns them.
- **Screen space** — the coordinate system of the visible Surface, measured in logical pixels from the top-left of the Surface, before any device-pixel scaling.

---

## 2. The two-space render model

### 2.1 The governing principle

**REN-5** The renderer MUST operate in exactly two coordinate spaces, and every drawing operation MUST be unambiguously assigned to one of them:

1. **Geometry is drawn in world space under the view transform.** Node shapes, edge paths, arrowheads, radial rings, cluster frames, selection rings, Focus set rings, the defined-class overlay and the Pin marker are all authored in world coordinates. The renderer establishes the view transform once and issues these draws in world units `[src: renderScene()]`.
2. **Every piece of text is drawn in screen space at a fixed point size.** Node labels, cluster titles and hidden-neighbour badge numerals are drawn after the world transform has been unwound, at font sizes that do not vary with zoom `[src: renderScene(), placeLabels()]`.

**REN-6** Text MUST NOT be scaled by the view transform. A renderer that draws text inside the world-space transform block is non-conforming even if the resulting pixels happen to look correct at `k = 1`.

### 2.2 Why — and why this MUST be preserved

**REN-7** This split was a deliberate correction to an earlier build in which text was scaled with the view. Implementers MUST preserve it. The rationale is threefold and MUST be treated as binding design intent, not commentary:

| Failure avoided | Explanation |
| --- | --- |
| Illegibility at low zoom | Text scaled by `k` becomes sub-pixel at `k < 0.3`. At the Budget's working size of 1,000 nodes the fitted zoom is routinely below that, so world-space text degenerates to grey noise. |
| Illegibility at high zoom | Text scaled by `k` becomes absurdly large at `k > 2`, so a zoomed-in view of three nodes is dominated by two enormous words and the geometry is lost. |
| Intractable collision avoidance | Overlap is a screen-space question. If text is scaled by `k`, the label rectangles change size on every zoom step and every cached measurement is invalidated. Fixing the point size makes a measured label rectangle stable in the only space that matters, which is what makes the greedy placement pass in [Label placement](#10-label-placement) cheap enough to run every frame. |

**REN-8** A consequence that implementers MUST accept as intended behaviour: because label size is fixed in screen space, zooming in does not enlarge labels — it spreads the anchors apart, which frees space and causes previously dropped labels to appear. This is the designed interaction, described normatively in [REN-142 and REN-143](#1011-the-drop-is-a-feature).

### 2.3 Space assignment table

**REN-9** Every draw operation MUST be assigned to the space given below. No other assignment is conforming.

| Draw operation | Space | Source |
| --- | --- | --- |
| Background fill | Screen | `renderScene()` |
| Dot grid | Screen (step derived from world step × `k`) | `renderScene()` |
| Radial rings | World | `renderScene()` |
| Cluster frames | World | `renderScene()` |
| Edge paths, dashes, arrowheads | World | `renderScene()` |
| Node fills, overlays, Focus set rings, selection rings, Pin markers | World | `renderScene()` |
| Cluster titles | Screen | `renderScene()` |
| Node labels and their haloes | Screen | `renderScene()`, `placeLabels()` |
| Hidden-neighbour badge pill and numeral | Screen | `renderScene()` |
| Minimap (all of it) | Its own minimap space | `drawMinimap()` |
| Export header and footer chrome | Export screen space | `drawExportChrome()` |

**REN-10** Stroke widths for world-space geometry MUST be divided by the zoom scalar `k` so that a stroke authored as "1.15 logical pixels" renders at 1.15 logical pixels regardless of zoom. The reference build does this at every world-space stroke site `[src: renderScene()]`. This makes stroke weights, like text, effectively screen-space quantities expressed through a world-space API.

**REN-11** Dash patterns for world-space strokes MUST likewise be divided by `k`, so the dash rhythm is zoom-invariant `[src: renderScene()]`.

---

## 3. The view transform

### 3.1 The triple

**REN-12** The view transform MUST be a three-component value `{ x, y, k }` where `x` and `y` are the screen-space translation in logical pixels and `k` is the uniform zoom scalar `[src: G]`. The initial value MUST be `{ x: 0, y: 0, k: 1 }` `[src: G]`.

**REN-13** There MUST be no rotation, no shear, and no independent horizontal and vertical scale. `k` is uniform.

### 3.2 World-to-screen and screen-to-world

**REN-14** World-to-screen conversion MUST be:

```
screenX = worldX * k + view.x
screenY = worldY * k + view.y
```

This is the form used for every screen-space anchor in the reference build `[src: placeLabels(), renderScene()]`.

**REN-15** Screen-to-world conversion MUST be the exact inverse:

```
worldX = (screenX - view.x) / k
worldY = (screenY - view.y) / k
```

`[src: hitTest()]`

**REN-16** The renderer MUST establish the world-space block by translating by `(view.x, view.y)` and then scaling by `(k, k)`, in that order, and MUST unwind it before drawing any screen-space text `[src: renderScene()]`.

### 3.3 Zoom clamp

**REN-17** Interactive zoom MUST be clamped to the closed range **`[0.08, 4]`** `[src: wireCanvas(), zoomBy()]`. Both the wheel path and the toolbar buttons apply the same clamp:

```
k1 = max(0.08, min(4, k0 * factor))
```

**REN-18** Zoom MUST be anchored: the world point under the zoom anchor MUST remain under it after the zoom. The translation update MUST be:

```
view.x = ax - (ax - view.x) * (k1 / k0)
view.y = ay - (ay - view.y) * (k1 / k0)
```

where `(ax, ay)` is the anchor in screen space `[src: wireCanvas(), zoomBy()]`.

**REN-19** The anchor MUST be the pointer position for wheel zoom and the Surface centre for toolbar zoom `[src: wireCanvas(), zoomBy()]`.

**REN-20** Zoom step factors MUST be `1.12` per wheel notch (and `1 / 1.12` when zooming out) and `1.25` per toolbar press (and `1 / 1.25` out) `[src: wireCanvas(), zoomBy()]`.

**REN-21** The zoom readout in the status surface MUST be `round(k * 100)` followed by a percent sign `[src: updateBudgetUI()]`.

### 3.4 Fit to view

**REN-22** Fit-to-view MUST compute the axis-aligned bounding box of every node in the Viewport **inflated by each node's own radius**, then choose a scale and translation that centres that box in the Surface with padding `[src: fitView()]`.

**REN-23** The fit algorithm MUST be, exactly:

```
 1. if node count == 0:
 2.     view = { x: 0, y: 0, k: 1 }
 3.     return
 4. minX = min over nodes of (n.x - n.r)
 5. maxX = max over nodes of (n.x + n.r)
 6. minY = min over nodes of (n.y - n.r)
 7. maxY = max over nodes of (n.y + n.r)
 8. w = surface logical width
 9. h = surface logical height
10. pad = 88
11. kx = (w - pad * 2) / max(1, maxX - minX)
12. ky = (h - pad * 2) / max(1, maxY - minY)
13. k = max(0.05, min(1.9, min(kx, ky)))
14. view.k = k
15. view.x = w / 2 - ((minX + maxX) / 2) * k
16. view.y = h / 2 - ((minY + maxY) / 2) * k
```

`[src: fitView()]`

**REN-24** The fit padding MUST be **88 logical pixels per side**, applied by subtracting `2 × 88` from each Surface dimension before the ratio `[src: fitView()]`.

**REN-25** The fit scale clamp MUST be **`[0.05, 1.9]`** `[src: fitView()]`. Note that this range is deliberately *not* the interactive clamp of REN-17: fit MAY produce a zoom below the interactive floor of `0.08` for a very wide scene, and MUST cap at `1.9` rather than `4` so that a two-node scene does not fill the Surface with two vast shapes.

**REN-26** The `max(1, …)` guards on lines 11–12 MUST be present; they prevent a division by zero when every node shares a coordinate.

**REN-27** Fit-to-view MUST be invoked on Surface resize, after a fresh Layout mode run, and on the user's explicit request `[src: wire(), wireCanvas(), wireSplitter()]`.

---

## 4. Palette acquisition

### 4.1 Read once, cache, re-read on theme change

**REN-28** The renderer MUST read every colour and font family it uses from Design tokens, MUST cache them in a single palette record, and MUST NOT read a token inside a per-node or per-edge loop `[src: refreshPalette()]`.

**REN-29** The renderer MUST re-read the whole palette after any theme change, before the next frame is drawn. In the reference build the theme setter calls the palette refresh synchronously after switching the theme attribute `[src: setTheme()]`.

**REN-30** The palette MUST also be populated once at start-up, before the first frame and before the first backing-store sizing `[src: init()]`.

**REN-31** An implementation MUST NOT hard-code any of the values in the table below. They are listed so that a reimplementation can verify its token wiring, not so that it can inline them. See [Design system](40-design-system.md#colour-tokens) for the authoritative token definitions.

### 4.2 Complete cached key list

**REN-32** The palette cache MUST contain exactly the following keys, mapped to exactly the following Design tokens `[src: refreshPalette()]`:

| Cache key | Design token | Light value | Dark value | Used for |
| --- | --- | --- | --- | --- |
| `canvas` | `--canvas` | `#F7F7F9` | `#17171A` | Background fill; defined-class overlay stroke; label halo stroke |
| `grid` | `--canvas-grid` | `#E4E4EA` | `#27272C` | Dot grid; radial rings |
| `text` | `--text` | `#1B1B1B` | `#F5F5F5` | Label fill; cluster title; Focus set ring; export title |
| `textSec` | `--text-secondary` | `#5A5A5A` | `#C2C2C2` | Cluster count; badge numeral; export caption, legend and footer note |
| `stroke` | `--stroke-strong` | `#C4C4C4` | `#565656` | Edge stroke; arrowhead fill; badge pill border |
| `divider` | `--stroke` | `#E1E1E1` | `#3D3D3D` | Cluster frame stroke; export header/footer rules |
| `surface` | `--surface` | `#FFFFFF` | `#2B2B2B` | Badge pill fill; export header and footer bands |
| `accent` | `--accent` | `#0F6CBD` | `#6CB8F6` | Selection ring; emphasised edge and arrowhead; minimap viewport rectangle |
| `warn` | `--warn` | `#8A5200` | `#E3A13C` | Pin marker |
| `fontUI` | `--font-ui` | `"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif` | same | All label, title, badge and legend text |
| `fontMono` | `--font-mono` | `"Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, "SFMono-Regular", monospace` | same | Export caption only |
| `class` | `--e-class` | `#0F6CBD` | `#6CB8F6` | Class node fill |
| `defined` | `--e-defined` | `#B36A00` | `#E3A13C` | Defined-class node fill |
| `individual` | `--e-individual` | `#0E7C66` | `#5FCFB4` | Individual node fill |
| `objectProperty` | `--e-objprop` | `#7A46C0` | `#C09BF0` | Object-property node fill |
| `dataProperty` | `--e-dataprop` | `#A8446F` | `#F095C0` | Data-property node fill |

**REN-33** Note the deliberate asymmetry in the two stroke keys: the cache key `stroke` maps to the *strong* stroke token, and the cache key `divider` maps to the *plain* stroke token `[src: refreshPalette()]`. An implementation that swaps these produces edges that are too faint and cluster frames that are too heavy. The token `--stroke-divider` is **not** read by the renderer.

**REN-34** The five Entity-kind fill keys MUST be keyed by the Entity kind identifier itself, so that fill lookup is a single indexed read `[src: nodeColour()]`:

```
nodeColour(n) = palette[n.kind] ?? palette.class
```

**REN-35** The fallback to `palette.class` MUST be present, so that an unknown Entity kind renders in the class colour rather than failing `[src: nodeColour()]`.

---

## 5. Device pixel handling

**REN-36** The renderer MUST maintain, for both the main Surface and the minimap Surface, a backing store sized to the logical size multiplied by the device pixel ratio, and MUST install a base transform that scales logical units up to device pixels `[src: resizeCanvas()]`.

**REN-37** The device pixel ratio used MUST be capped at **2**:

```
dpr = min(2, systemDevicePixelRatio || 1)
```

`[src: resizeCanvas()]` The cap exists because a 1,000-node scene at a 3× ratio triples the fill cost for no perceptible gain; see [Performance](#18-performance).

**REN-38** Backing-store dimensions MUST be:

```
backingWidth  = max(1, round(logicalWidth  * dpr))
backingHeight = max(1, round(logicalHeight * dpr))
```

`[src: resizeCanvas()]` The `max(1, …)` guard MUST be present so that a collapsed panel does not produce a zero-sized target.

**REN-39** The base transform MUST be set to the uniform scale `dpr` with no translation, i.e. the matrix `(dpr, 0, 0, dpr, 0, 0)` `[src: resizeCanvas()]`.

**REN-40** **All geometry in this document MUST be authored in logical units.** No constant in this specification is a device pixel. The device pixel ratio MUST appear exactly once in the pipeline — in the base transform of REN-39 — and MUST NOT appear in any node radius, stroke width, font size, padding, threshold or offset.

**REN-41** The renderer MUST re-run backing-store sizing whenever the Surface's logical size changes: on window resize, on splitter drag, and on any panel show/hide that changes the graph panel's box `[src: wire(), wireSplitter()]`.

**REN-42** The main Surface MUST read its logical size from its own layout box, not from the window, because it is one cell of a resizable multi-pane layout `[src: draw(), resizeCanvas()]`.

**REN-43** Export render targets are sized independently of the device pixel ratio and MUST NOT use `dpr`; see [Export](#15-export).

---

## 6. Draw order

### 6.1 The pass list

**REN-44** A frame MUST consist of the following passes, executed in exactly this order. Each pass MUST leave the drawing state it changed restored, or MUST explicitly set every state value it depends on `[src: renderScene()]`.

| # | Pass | Space | Inputs | MUST NOT |
| --- | --- | --- | --- | --- |
| 1 | Background fill | Screen | Surface logical size; background override or `palette.canvas` | Leave any part of the Surface uncleared; rely on a previous frame's pixels |
| 2 | Dot grid | Screen | `view`, `palette.grid` | Draw when the derived step is at or below the threshold; draw when grid is disabled for this render |
| 3 | Radial rings | World | `radialRings`, `ringOrigin`, `palette.grid` | Draw unless the resolved Layout mode is `radial`; use a zoom-varying stroke width |
| 4 | Cluster frames | World | cluster frame rectangles, `palette.divider` | Draw unless the resolved Layout mode is `grid`; fill the frames |
| 5 | Edges | World | edge set, node positions/radii, hover, resolved Layout mode, `palette.stroke` / `palette.accent` | Draw an edge whose endpoints are not both present; leave a dash pattern set for the next edge |
| 6 | Nodes | World | node set, Focus set, selection, hover, palette fills | Draw labels; re-read tokens |
| 7 | Cluster titles | Screen | cluster frame rectangles, `view`, `palette.text` / `palette.textSec` | Draw unless the resolved Layout mode is `grid` and the zoom threshold is met |
| 8 | Node labels | Screen | placement result, hover neighbour set, `palette.text` | Draw a label that the placement pass rejected; change any geometry |
| 9 | Hidden-neighbour badges | Screen | node set, Hidden neighbour counts, `view` | Draw when the zoom threshold is not met; draw for a node with zero Hidden neighbours |

**REN-45** Passes 3 to 6 MUST execute inside a single world-space transform block, opened once and closed once. Passes 1, 2, 7, 8 and 9 MUST execute outside it `[src: renderScene()]`.

**REN-46** The global alpha MUST be reset to `1` after the edge pass and again after the node pass, so that a dimmed final node cannot bleed into subsequent passes `[src: renderScene()]`.

**REN-47** A frame MUST end by drawing the minimap, which is a separate Surface and therefore a separate target; see [Minimap](#14-the-minimap) `[src: draw()]`.

**REN-48** The renderer MUST NOT mutate model state in any pass (restating REN-3 as a per-pass obligation). In particular, the hover neighbour set computed in pass 5 MUST be a per-frame temporary, not a cached field on the model.

### 6.2 Pass 1 — background fill

**REN-49** The renderer MUST fill the entire Surface rectangle with the background colour at the start of every frame `[src: renderScene()]`.

**REN-50** The background colour MUST be a per-render parameter that defaults to `palette.canvas`. Callers MAY override it; the override, if present, MUST also be used as the label halo stroke colour (see REN-139) so that haloes match the ground they sit on `[src: renderScene()]`.

**REN-51** The renderer MUST NOT rely on a clear-to-transparent followed by a composited background; the fill is opaque and unconditional.

### 6.3 Pass 2 — dot grid

**REN-52** The dot grid MUST be derived from a **world step of 34 units**, converted to a screen step:

```
step = 34 * k
```

`[src: renderScene()]`

**REN-53** The grid MUST be drawn only when `step > 11` logical pixels — equivalently when `k > 11 / 34 ≈ 0.3235` `[src: renderScene()]`. Below that the dots are closer than three pixels apart and read as a wash.

**REN-54** The grid origin MUST be the view translation reduced modulo the step, so the grid appears pinned to world space while being iterated in screen space:

```
ox = view.x mod step
oy = view.y mod step
```

`[src: renderScene()]`

**REN-55** Each grid mark MUST be an axis-aligned square of **1.5 × 1.5 logical pixels**, filled with `palette.grid`, with its top-left corner at each `(ox + i·step, oy + j·step)` for all non-negative integers `i`, `j` that fall within the Surface `[src: renderScene()]`.

**REN-56** The grid MUST be suppressible by the caller. Export uses the default (grid on); a caller MAY pass a flag to disable it `[src: renderScene()]`.

### 6.4 Pass 3 — radial rings

**REN-57** When and only when the resolved Layout mode is `radial` and ring radii are available, the renderer MUST stroke one circle per radius, centred on the ring origin, in `palette.grid`, with stroke width `1 / k` `[src: renderScene()]`.

**REN-58** The ring origin MUST default to world `(0, 0)` when the Layout mode has not supplied one `[src: renderScene()]`.

**REN-59** Rings MUST NOT be filled and MUST NOT be culled per-ring; they are cheap and the count is small.

### 6.5 Pass 4 — cluster frames

**REN-60** When and only when the resolved Layout mode is `grid`, the renderer MUST stroke one rounded rectangle per cluster frame, in `palette.divider`, with stroke width `1 / k` and **corner radius 10 world units** `[src: renderScene()]`.

**REN-61** The rounded rectangle MUST be constructed as a closed path: move to `(x + r, y)`, then four corner arcs of radius `r` taken in the order top-right, bottom-right, bottom-left, top-left, then close `[src: roundRect()]`.

**REN-62** Cluster frames MUST NOT be filled. The cluster ground is the canvas.

---

## 7. Node rendering

### 7.1 Shape by Entity kind

**REN-63** Entity kind MUST be distinguishable by **shape alone**. An implementation MUST NOT encode Entity kind by colour alone, and MUST NOT ship a rendering in which two Entity kinds share a shape and differ only in hue. This is an accessibility requirement as much as a legibility one; see [Accessibility](#17-accessibility) and [Design system](40-design-system.md#entity-palette).

**REN-64** The five Entity kinds MUST render with exactly these shapes and geometry, where `(x, y)` is the node centre in world space and `r` is the node radius `[src: nodePath(), KIND_META]`:

| Entity kind | Shape | Exact construction |
| --- | --- | --- |
| `class` | Rounded square | Axis-aligned square of half-extent `s = r * 0.92` (side `1.84 r`), corner radius `rr = min(5, r * 0.45)`. Path: move to `(x - s + rr, y - s)`, then four corner arcs in the order top-right, bottom-right, bottom-left, top-left, then close. |
| `defined` | Rounded square | Identical to `class`, plus the overlay mark of REN-72. |
| `individual` | Circle | Full circle of radius `r` centred on `(x, y)`. |
| `objectProperty` | Diamond | Four-point polygon `(x, y - r) → (x + r, y) → (x, y + r) → (x - r, y)`, closed. |
| `dataProperty` | Hexagon | Six-point polygon with vertex `i` at angle `θ_i = π/6 + i·π/3` for `i = 0…5`, each vertex at `(x + cos θ_i · r, y + sin θ_i · r)`, closed. This is a flat-top orientation. |

**REN-65** Any Entity kind not in the table MUST fall through to the rounded-square construction `[src: nodePath()]`.

**REN-66** The hexagon's first vertex MUST be a move and the remaining five MUST be lines; the reference build branches on the index to achieve this `[src: nodePath()]`.

**REN-67** Node radius is supplied by the Viewport, not computed here, but the renderer MUST treat it as already including the degree term. For reference only, and non-normatively: the base is `5.5` for Individuals, `7` for object and data properties, and `8.5` otherwise, with `min(9, log2(1 + deg) * 1.6)` added `[src: nodeRadius()]`.

### 7.2 Node draw sequence

**REN-68** For each node the renderer MUST execute the following steps in order `[src: renderScene()]`:

```
 1. dim = hovering AND node not in hover neighbour set
 2. globalAlpha = dim ? 0.25 : 1
 3. if node is the selection:
 4.     stroke a circle at (n.x, n.y) radius (n.r + 7 / k)
 5.         colour = palette.accent, width = 2.5 / k
 6. build the kind path at (n.x, n.y, n.r)
 7. fill it with nodeColour(n)
 8. if kind == defined:
 9.     stroke a plus mark: horizontal from (n.x - n.r*0.4, n.y) to (n.x + n.r*0.4, n.y)
10.                          vertical  from (n.x, n.y - n.r*0.4) to (n.x, n.y + n.r*0.4)
11.         colour = palette.canvas, width = 2 / k
12. if node is in the Focus set:
13.     build the kind path at (n.x, n.y, n.r + 3 / k) and stroke it
14.         colour = palette.text, width = 1.8 / k
15. if node is pinned:
16.     fill a circle at (n.x - n.r*0.8, n.y - n.r*0.8) radius (3.4 / k + 1)
17.         colour = palette.warn
```

**REN-69** The selection ring MUST be a **circle** regardless of Entity kind — it is not the kind path — at radius `n.r + 7 / k`, stroked in `palette.accent` at width `2.5 / k` `[src: renderScene()]`.

**REN-70** The Focus set ring MUST be the **kind path** re-built at the inflated radius `n.r + 3 / k`, stroked in `palette.text` at width `1.8 / k` `[src: renderScene()]`. It therefore echoes the node's silhouette, which distinguishes it at a glance from the circular selection ring.

**REN-71** The Focus set ring inflation `3 / k` is a screen-space offset expressed in world units, so the ring sits 3 logical pixels outside the shape at every zoom `[src: renderScene()]`.

**REN-72** The defined-class overlay mark MUST be a plus sign (two crossing strokes) drawn in the **background colour**, not in a foreground colour, so that it reads as a cut-out through the fill `[src: renderScene()]`. Its arms extend `±0.4 r` from centre in each axis and its stroke width is `2 / k`.

**REN-73** The Pin marker MUST be a filled circle in `palette.warn`, placed at the node's upper-left at offset `(-0.8 r, -0.8 r)` from centre, with radius `3.4 / k + 1` `[src: renderScene()]`. The `+ 1` term is in world units and is therefore the only node decoration that grows slightly with zoom-out; this is the reference behaviour and MUST be reproduced.

**REN-74** Nodes MUST be drawn in a single pass after all edges, so that no edge crosses over a node fill `[src: renderScene()]`.

**REN-75** There MUST be no node-level z-ordering beyond iteration order. The selection and Focus set are distinguished by their rings, not by being raised.

---

## 8. Edge rendering

### 8.1 Predicate classification

**REN-76** Every edge MUST be classified as **structural** or **incidental** by predicate membership in the hierarchy predicate set `[src: HIER_PREDS]`. The set MUST contain exactly three predicates:

| Predicate | IRI | Classification |
| --- | --- | --- |
| `rdfs:subClassOf` | `http://www.w3.org/2000/01/rdf-schema#subClassOf` | Structural |
| `rdfs:subPropertyOf` | `http://www.w3.org/2000/01/rdf-schema#subPropertyOf` | Structural |
| `rdf:type` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#type` | Structural |

Every other predicate is incidental `[src: HIER_PREDS]`.

### 8.2 Stroke weight and opacity

**REN-77** Edge stroke colour, opacity and width MUST be selected from this table, where *emphasised* means a hover is active and this edge is incident on the hovered node `[src: renderScene()]`:

| Condition | Colour | Opacity | Width (world units) |
| --- | --- | --- | --- |
| Hover active, edge emphasised | `palette.accent` | `1` | `2 / k` |
| Hover active, edge not emphasised | `palette.stroke` | `0.18` | `1.15 / k` if structural, else `1 / k` |
| No hover, structural | `palette.stroke` | `0.72` | `1.15 / k` |
| No hover, incidental | `palette.stroke` | `0.48` | `1 / k` |

**REN-78** Structural edges MUST be both heavier (`1.15` against `1.0`) and more opaque (`0.72` against `0.48`) than incidental ones. The taxonomy is the skeleton of the picture and MUST read as such.

**REN-79** Edges whose predicate is `rdf:type` MUST be stroked with a **dash pattern of `[5 / k, 5 / k]`** — five on, five off, in logical pixels `[src: renderScene()]`. All other edges MUST be solid.

**REN-80** The dash pattern MUST be cleared immediately after the edge path is stroked, before the arrowhead is filled, so that arrowheads are never dashed and the next edge does not inherit the pattern `[src: renderScene()]`.

**REN-81** An edge MUST be skipped entirely if either endpoint is absent from the Viewport `[src: renderScene()]`.

### 8.3 Routing

**REN-82** Edge routing MUST be selected by the following decision, evaluated in order, for an edge from node `a` to node `b` `[src: renderScene()]`:

```
 1. if resolvedLayoutMode == 'hierarchy' AND abs(a.y - b.y) > 24:
 2.     ELBOW
 3. else if e.mn > 1:
 4.     QUADRATIC FAN
 5. else:
 6.     STRAIGHT LINE
```

**REN-83** **Elbow routing** MUST be a four-point orthogonal path through the vertical midpoint:

```
my = (a.y + b.y) / 2
path: M (a.x, a.y) → L (a.x, my) → L (b.x, my) → L (b.x, b.y)
```

The direction anchor for the arrowhead MUST be set to `(b.x, my)` — the start of the final vertical segment `[src: renderScene()]`.

**REN-84** The elbow threshold MUST be **24 world units of vertical separation**. Below that, an elbow would degenerate into a flat zig-zag and a straight line is used instead `[src: renderScene()]`.

**REN-85** **Quadratic fanning** applies when two or more edges connect the same unordered node pair. Each such edge carries a multiplicity index `mi` (zero-based) and a multiplicity count `mn` `[src: indexEdges()]`. The control point MUST be derived as:

```
mx  = (a.x + b.x) / 2
my  = (a.y + b.y) / 2
dx  = b.x - a.x
dy  = b.y - a.y
len = max(1, hypot(dx, dy))
off = (mi - (mn - 1) / 2) * 22            // OFFSET CONSTANT = 22 world units
cx  = mx - dy / len * off
cy  = my + dx / len * off
path: M (a.x, a.y) → Q (cx, cy) (b.x, b.y)
```

The direction anchor for the arrowhead MUST be set to `(cx, cy)` `[src: renderScene()]`.

**REN-86** The fan offset constant MUST be **22 world units**. The centring term `(mn - 1) / 2` MUST be present, so that a pair of parallel edges straddles the straight line symmetrically at `±11`, and an odd count keeps one edge straight through the middle `[src: renderScene()]`.

**REN-87** `len` MUST be floored at `1` so that coincident nodes do not produce a division by zero `[src: renderScene()]`.

**REN-88** **Straight line** routing MUST be a single segment from `(a.x, a.y)` to `(b.x, b.y)`, with the direction anchor left at its initial value `(a.x, a.y)` `[src: renderScene()]`.

### 8.4 Arrowheads

**REN-89** Arrowheads MUST be suppressed when `k <= 0.42`. At and below that zoom the arrowhead is smaller than the line join it sits on and only adds noise `[src: renderScene()]`.

**REN-90** The arrowhead direction vector MUST be taken from the **direction anchor to the target node centre**, not from the source node centre. The anchor is set per routing mode by REN-83, REN-85 and REN-88, which is what makes the arrowhead tangent to the last segment of an elbow path and tangent to the curve's terminal control leg for a fanned path `[src: renderScene()]`.

**REN-91** The arrowhead MUST be constructed as:

```
 1. dx = b.x - anchorX
 2. dy = b.y - anchorY
 3. d  = max(1, hypot(dx, dy))
 4. ux = dx / d ; uy = dy / d
 5. tipX = b.x - ux * (b.r + 2.5)
 6. tipY = b.y - uy * (b.r + 2.5)
 7. s = 6 / k
 8. triangle:
 9.     (tipX, tipY)
10.     (tipX - ux*s - uy*s*0.5, tipY - uy*s + ux*s*0.5)
11.     (tipX - ux*s + uy*s*0.5, tipY - uy*s - ux*s*0.5)
12. fill with palette.accent when emphasised, else palette.stroke
```

`[src: renderScene()]`

**REN-92** The tip MUST be set back from the target node centre by `b.r + 2.5` world units, so the arrow touches the node's boundary with a 2.5-unit gap rather than overlapping the fill `[src: renderScene()]`.

**REN-93** The arrowhead length MUST be `6 / k` world units (6 logical pixels) and its half-width `3 / k` (half of `s`) `[src: renderScene()]`.

**REN-94** Arrowheads MUST be filled, not stroked, and MUST take the same emphasis colour as their edge `[src: renderScene()]`.

**REN-95** Arrowhead geometry uses the node radius of the **target** node only. The set-back at the source end is not applied; edges visually originate at the source centre. This is the reference behaviour.

---

## 9. Hover emphasis

**REN-96** When a node is hovered, the renderer MUST compute a **neighbour set** containing the hovered node itself plus every node joined to it by any edge in the Viewport, in either direction `[src: renderScene()]`:

```
1. near = { hovered.iri }
2. for each edge e in the edge set:
3.     if e.a == hovered.iri: near.add(e.b)
4.     if e.b == hovered.iri: near.add(e.a)
```

**REN-97** The neighbour set MUST be computed once per frame, before the edge pass, and MUST be a frame-local temporary `[src: renderScene()]`.

**REN-98** The neighbour set MUST be computed by a linear scan over the edge set in the reference build. An implementation MAY use an adjacency index instead, provided the resulting set is identical.

**REN-99** The emphasis alpha values MUST be exactly `[src: renderScene()]`:

| Element | Emphasised alpha | Dimmed alpha |
| --- | --- | --- |
| Edge incident on hovered node | `1.0` | `0.18` (non-incident edges) |
| Node in neighbour set | `1.0` | `0.25` (nodes outside the set) |
| Label of a node in the neighbour set | `1.0` | `0.30` (labels outside the set) |

**REN-100** Note that the dimmed alpha for labels (`0.30`) is deliberately higher than for nodes (`0.25`), so dimmed text stays just readable. Both MUST be reproduced exactly.

**REN-101** **Hover emphasis MUST NOT change geometry.** No position, radius, shape, routing decision, label placement input or label rectangle may differ between the hovered and un-hovered rendering of the same Viewport. The only permitted differences are stroke colour (`palette.accent` in place of `palette.stroke`), edge stroke width for incident edges (`2 / k`), and alpha. Every other value is identical.

**REN-102** Because emphasis does not change geometry, the label placement pass MUST NOT be re-ordered by hover — except through the hover term in the priority function of REN-107, which is itself part of the placement input, not a geometric change.

**REN-103** Hover emphasis MUST be disabled for export: export renders pass a null hover `[src: renderExportCanvas(), exportSVG()]`.

---

## 10. Label placement

### 10.1 Purpose and shape of the pass

**REN-104** Labels MUST be placed by a single greedy pass that runs every frame, in screen space, over all nodes in the Viewport. The pass MUST return an ordered list of accepted labels, each carrying the node, the display text and the screen anchor `[src: placeLabels()]`.

**REN-105** The pass MUST be a pure function of the node set, the view transform, the Surface size, the hover and selection identifiers, the Focus set and the maximum-label option. It MUST NOT mutate any node `[src: placeLabels()]`.

### 10.2 Priority function

**REN-106** Candidate nodes MUST be sorted by descending priority before any acceptance decision is made `[src: placeLabels()]`.

**REN-107** The priority function MUST be exactly the sum of these six terms `[src: placeLabels()]`:

| # | Term | Condition | Weight |
| --- | --- | --- | --- |
| 1 | Focus set | node is in the Focus set | `+4000` |
| 2 | Selection | node is the current selection | `+3000` |
| 3 | Hover | node is the currently hovered node | `+2000` |
| 4 | Pin | node is pinned | `+900` |
| 5 | Radius | always | `+ n.r * 18` |
| 6 | In-view degree | always | `+ n.shownDeg` |

```
prio(n) = (focus ? 4000 : 0)
        + (selected ? 3000 : 0)
        + (hovered ? 2000 : 0)
        + (pinned ? 900 : 0)
        + n.r * 18
        + n.shownDeg
```

**REN-108** The weights MUST be reproduced exactly. Their relative magnitudes encode the intended precedence: any Focus set member outranks any selection, which outranks any hover, which outranks any Pin, which outranks any node of radius below 50 — and radius (scaled by 18) dominates in-view degree so that a large hub wins the space over a small node with many visible edges.

**REN-109** The in-view degree term MUST use `shownDeg` (edges actually present in the Viewport), not the total store degree `deg` `[src: placeLabels()]`. Total degree drives radius, which already contributes through term 5.

**REN-110** Ties MAY be broken arbitrarily; no stable-sort guarantee is required.

### 10.3 Greedy accept-or-drop

**REN-111** The pass MUST iterate the sorted candidates and, for each, either accept the label and reserve its rectangle, or drop it. A dropped label MUST NOT be retried, relocated, shrunk, rotated or leadered `[src: placeLabels()]`.

**REN-112** The full algorithm MUST be `[src: placeLabels()]`:

```
 1. bucket = empty spatial hash
 2. maxLabels = options.max ?? 900
 3. sorted = all Viewport nodes sorted by descending prio()
 4. out = []
 5. for n in sorted:
 6.     if out.length >= maxLabels: break
 7.     sx = n.x * k + view.x
 8.     sy = n.y * k + view.y + n.r * k + 4
 9.     if sx < -240 or sy < -40 or sx > surfaceW + 240 or sy > surfaceH + 40: continue
10.     text = shortLabel(n)
11.     set font to labelFont(n)
12.     tw = measureText(text).width
13.     rect = { x: sx - tw/2 - 3, y: sy - 2, w: tw + 6, h: 16 }
14.     if overlaps(bucket, rect): continue
15.     insert(bucket, rect)
16.     out.push({ n, text, sx, sy })
17. return out
```

**REN-113** The anchor `sy` MUST place the label **below** the node: the node centre in screen space, plus the node radius scaled to screen (`n.r * k`), plus a **4 logical pixel** gap `[src: placeLabels()]`.

**REN-114** The anchor `sx` MUST be the node centre in screen space with no offset; labels are centre-aligned about it `[src: placeLabels()]`.

### 10.4 Spatial hash and overlap test

**REN-115** Overlap testing MUST use a uniform spatial hash with **cell size `B = 96` logical pixels** `[src: placeLabels()]`.

**REN-116** A rectangle MUST be registered in every cell it touches. The cell index range MUST be derived by flooring each edge coordinate by `B` `[src: placeLabels()]`:

```
gx0 = floor(rect.x / B)          gx1 = floor((rect.x + rect.w) / B)
gy0 = floor(rect.y / B)          gy1 = floor((rect.y + rect.h) / B)
```

**REN-117** The overlap test MUST examine every rectangle already registered in any cell in that range, and MUST report an overlap on the first strict axis-aligned intersection `[src: placeLabels()]`:

```
overlap(r, q) ⟺ r.x < q.x + q.w AND r.x + r.w > q.x
             AND r.y < q.y + q.h AND r.y + r.h > q.y
```

**REN-118** The comparison MUST be strict (`<`, `>`), so that rectangles sharing exactly an edge do not count as overlapping `[src: placeLabels()]`.

**REN-119** The spatial hash MUST be rebuilt from empty on every pass. It MUST NOT persist across frames; the anchors move whenever the view or the layout does.

**REN-120** Negative cell indices MUST be supported, because label rectangles may begin left of or above the Surface origin within the cull margin `[src: placeLabels()]`.

### 10.5 Label rectangle

**REN-121** The label rectangle MUST be derived from the **measured** text advance width using the same font that will be used to draw the text. An implementation MUST NOT estimate the width from the character count for the on-screen or raster-export path `[src: placeLabels()]`.

**REN-122** The rectangle MUST be:

| Field | Value | Meaning |
| --- | --- | --- |
| `x` | `sx - tw/2 - 3` | Centred on the anchor, with 3 px of left bearing |
| `y` | `sy - 2` | 2 px above the anchor (the text baseline convention is top-aligned) |
| `w` | `tw + 6` | Measured width plus 3 px bearing on each side |
| `h` | `16` | Fixed 16 logical pixels, for both label sizes |

`[src: placeLabels()]`

**REN-123** The rectangle height MUST be the constant `16` for every Entity kind, even though the two label font sizes differ. This deliberately over-reserves for the 11 px Individual label so that mixed-size neighbours do not interleave `[src: placeLabels()]`.

### 10.6 Off-screen cull

**REN-124** A candidate whose **anchor** falls outside the culling box MUST be skipped before measurement. The margins MUST be asymmetric `[src: placeLabels()]`:

| Edge | Margin (logical pixels) |
| --- | --- |
| Left | `240` |
| Right | `240` |
| Top | `40` |
| Bottom | `40` |

```
cull ⟺ sx < -240 or sy < -40 or sx > surfaceW + 240 or sy > surfaceH + 40
```

**REN-125** The horizontal margin MUST be the larger of the two because a long label centred on an anchor just off the left or right edge can still be partly visible, whereas the fixed 16 px label height means the vertical overhang is bounded `[src: placeLabels()]`.

**REN-126** Culling is by anchor, not by rectangle. A label whose rectangle straddles the Surface edge MUST still be drawn and MUST still reserve its space.

### 10.7 Typography

**REN-127** The label font MUST be selected by Entity kind `[src: labelFont()]`:

| Entity kind | Weight | Size | Family |
| --- | --- | --- | --- |
| `individual` | `400` | `11px` | `palette.fontUI` |
| every other kind | `600` | `12.5px` | `palette.fontUI` |

```
labelFont(n) = (n.kind == 'individual' ? '400 11px ' : '600 12.5px ') + palette.fontUI
```

**REN-128** These sizes are **fixed in screen space** and MUST NOT be multiplied by `k` (restating REN-6 for the label pass).

**REN-129** Labels MUST be drawn centre-aligned horizontally and top-aligned vertically relative to the anchor `[src: renderScene()]`.

### 10.8 Truncation

**REN-130** Display text MUST be derived from the node label by this rule `[src: shortLabel()]`:

```
shortLabel(n) = n.label.length > 30
              ? n.label.slice(0, 28) + '…'
              : n.label
```

**REN-131** The truncation threshold MUST be **30 characters**; the retained prefix MUST be **28 characters**; the ellipsis MUST be the single character U+2026 HORIZONTAL ELLIPSIS, not three full stops `[src: shortLabel()]`.

**REN-132** Truncation MUST be applied before measurement, so the reserved rectangle matches the drawn text `[src: placeLabels()]`.

**REN-133** Truncation MUST NOT be word-aware, MUST NOT respect grapheme clusters in the reference build, and MUST NOT be zoom-dependent. An implementation SHOULD count by code point rather than code unit where the platform makes that natural; this is a permitted refinement because no label in the `pizza:` fixture exceeds the BMP.

### 10.9 Maximum label count

**REN-134** The pass MUST stop accepting once the accepted count reaches the maximum. The default maximum MUST be **900** `[src: placeLabels()]`.

**REN-135** Export renders MUST raise the maximum to **4000** for both raster and vector paths `[src: renderExportCanvas(), exportSVG()]`. An export has no frame budget and a much larger canvas, so far more labels fit.

**REN-136** The cap MUST be applied to *accepted* labels, not to candidates examined `[src: placeLabels()]`.

### 10.10 Halo

**REN-137** Each accepted label MUST be drawn twice: first a **stroke** in the background colour at width **3.5 logical pixels**, then a **fill** in `palette.text` `[src: renderScene()]`.

**REN-138** The line join for the halo stroke MUST be **round**, so that the halo does not grow spikes at sharp letterform corners `[src: renderScene()]`.

**REN-139** The halo colour MUST be the render's background colour — the caller's override if present, otherwise `palette.canvas` — so that the halo matches the ground the label sits on `[src: renderScene()]`.

**REN-140** The halo exists to keep text legible where it crosses edges. Without it, a label over a dense edge bundle is unreadable. It MUST NOT be omitted as an optimisation.

**REN-141** The halo MUST be drawn per label, immediately before that label's fill, so that adjacent labels' haloes do not erase each other's glyphs.

### 10.11 The drop is a feature

**REN-142** A label that would overlap an already-accepted label MUST simply not be drawn. There MUST be no leader line, no displacement search, no font shrink and no second placement attempt `[src: placeLabels()]`.

**REN-143** Implementations MUST document this to users as intended: **labels that would overlap are not drawn, and zooming in reveals them.** Zooming increases the screen-space separation of anchors while leaving label rectangles the same size, which frees space; the next frame's greedy pass then accepts labels it previously dropped. This is the primary reason the two-space model of [REN-5](#21-the-governing-principle) is worth its cost.

**REN-144** Because the pass is greedy and priority-ordered, the set of visible labels MUST be stable under small view changes for high-priority nodes. An implementation MUST NOT introduce randomisation into the ordering.

---

## 11. Hidden-neighbour badges

**REN-145** A **hidden-neighbour badge** MUST be drawn for every node whose Hidden neighbour count is greater than zero, and MUST NOT be drawn for any node whose count is zero `[src: renderScene()]`.

**REN-146** The badge pass MUST be suppressed entirely when `k <= 0.3` `[src: renderScene()]`, and MAY be suppressed by an explicit caller flag `[src: renderScene()]`.

**REN-147** The badge anchor MUST be at the node's upper-right in screen space `[src: renderScene()]`:

```
sx = n.x * k + view.x + n.r * k * 0.92 + 3
sy = n.y * k + view.y - n.r * k * 0.92 - 3
```

The `0.92` factor matches the rounded-square half-extent of REN-64, so the badge sits just outside the corner of a class node rather than floating away from a circle.

**REN-148** The badge MUST be culled when its anchor falls outside the box `sx < -40`, `sy < -20`, `sx > surfaceW + 40`, `sy > surfaceH + 20` `[src: renderScene()]`.

**REN-149** The badge text MUST be a `+` followed by the abbreviated count, abbreviated by this rule `[src: renderScene()]`:

| Hidden neighbour count `h` | Rendered numeral | Example |
| --- | --- | --- |
| `h <= 999` | the integer, unabbreviated | `+37` |
| `1000 <= h <= 9999` | `(h / 1000)` to **one decimal place**, then `k` | `+1.4k` |
| `h >= 10000` | `round(h / 1000)`, then `k` | `+12k` |

```
t = '+' + (h > 9999 ? round(h / 1000) + 'k'
        : h > 999  ? (h / 1000).toFixed(1) + 'k'
        : h)
```

**REN-150** The badge font MUST be `600 9.5px` in `palette.fontUI`, with centre horizontal alignment and middle vertical alignment `[src: renderScene()]`.

**REN-151** The badge pill geometry MUST be `[src: renderScene(), roundRect()]`:

| Property | Value |
| --- | --- |
| Width | `measuredTextWidth + 9` |
| Height | `14` logical pixels |
| Corner radius | `height / 2` = `7` (a full stadium) |
| Position | Centred on the anchor: top-left at `(sx - w/2, sy - h/2)` |
| Fill | `palette.surface` |
| Border | `palette.stroke`, width `1` |

**REN-152** The numeral MUST be filled in `palette.textSec` at `(sx, sy + 0.5)` — a half-pixel downward nudge that optically centres the digits against the pill `[src: renderScene()]`.

**REN-153** The pill MUST be filled and then stroked, in that order, so the border is not eaten by the fill `[src: renderScene()]`.

**REN-154** Badges MUST be drawn after labels, so a badge is never obscured by a label halo `[src: renderScene()]`.

---

## 12. Cluster titles

**REN-155** Cluster titles MUST be drawn when and only when the resolved Layout mode is `grid` **and** `k > 0.22` `[src: renderScene()]`.

**REN-156** Each cluster title MUST be anchored in screen space at the cluster frame's top-left corner plus a fixed inset `[src: renderScene()]`:

```
sx = block.x * k + view.x + 12
sy = block.y * k + view.y + 22
```

**REN-157** Cluster titles MUST be culled when `sx < -200`, `sx > surfaceW + 200`, `sy < -20` or `sy > surfaceH + 20` `[src: renderScene()]`.

**REN-158** Typography and colour MUST be `[src: renderScene()]`:

| Element | Font | Colour | Alignment |
| --- | --- | --- | --- |
| Cluster name | `600 12px` `palette.fontUI` | `palette.text` | left, alphabetic baseline |
| Count suffix | `400 11px` `palette.fontUI` | `palette.textSec` | left, alphabetic baseline |

**REN-159** The count suffix MUST be the cluster's node count rendered as a bare integer, placed at:

```
countX = sx + measureText(clusterName).width + 46
```

`[src: renderScene()]` — that is, the measured title width plus a **46 logical pixel** gap, on the same baseline.

**REN-160** The renderer MUST restore the title font after drawing the count, so the next cluster's title is not drawn at the count's size `[src: renderScene()]`.

**REN-161** **Known divergence.** The SVG export path writes the cluster title and count as a single text run joined by ` · ` (space, U+00B7 MIDDLE DOT, space) inside the world-space group, rather than as two screen-space runs separated by a 46 px gap `[src: exportSVG()]`. An implementation MUST reproduce the on-screen form for on-screen rendering and MAY adopt the `name · count` form for both, provided it does so consistently. This inconsistency is flagged in [Acceptance criteria](61-acceptance-criteria-and-tests.md#known-divergences).

---

## 13. Hit testing

**REN-162** Hit testing MUST convert the screen point to world space using the inverse view transform of [REN-15](#32-world-to-screen-and-screen-to-world) `[src: hitTest()]`.

**REN-163** Hit testing MUST use a **circular** proximity test against the node centre, for every Entity kind. It MUST NOT test the kind path. A diamond or hexagon is therefore slightly over-generous at its concave regions; this is intentional and MUST be reproduced `[src: hitTest()]`.

**REN-164** The hit radius MUST be the node radius plus a **6 logical pixel** tolerance, expressed in world units as `6 / k` `[src: hitTest()]`. The tolerance therefore stays constant on screen as the user zooms.

**REN-165** When several nodes qualify, the **nearest** MUST win. The algorithm MUST be `[src: hitTest()]`:

```
1. wx = (sx - view.x) / k
2. wy = (sy - view.y) / k
3. best = null ; bestD = +Infinity
4. for n in Viewport nodes:
5.     d = hypot(n.x - wx, n.y - wy)
6.     if d < n.r + 6 / k AND d < bestD:
7.         best = n ; bestD = d
8. return best
```

**REN-166** "Nearest" MUST be measured by absolute centre distance, not by distance normalised against radius. A large node therefore does not shadow a small node that the pointer is closer to `[src: hitTest()]`.

**REN-167** Hit testing MUST return `null` when nothing qualifies, and callers MUST treat `null` as "background" `[src: hitTest()]`.

**REN-168** Hit testing MUST be a pure query. It MUST NOT change selection, hover, or any node field; the interaction layer does that. See [Graph viewport and budget](20-graph-viewport-and-budget.md#interaction-model).

**REN-169** The input point MUST be in Surface-local logical pixels, i.e. the pointer position minus the Surface's client bounding origin `[src: wireCanvas()]`.

**REN-170** Hit testing MUST NOT be affected by label rectangles. Labels are not hit targets.

---

## 14. The minimap

**REN-171** The minimap MUST be drawn on its own Surface, once per frame, immediately after the main Surface `[src: draw(), drawMinimap()]`.

**REN-172** The minimap Surface MUST be 180 × 120 logical pixels, positioned at the bottom-right of the graph panel `[src: CSS .graph__minimap]`.

**REN-173** The minimap MUST clear to transparent and then fill with `palette.canvas` `[src: drawMinimap()]`.

**REN-174** When the Viewport is empty the minimap MUST show only the background fill and return `[src: drawMinimap()]`.

**REN-175** The minimap extent MUST be the bounding box of node **centres**, **without** radius inflation — unlike fit-to-view, which inflates by radius `[src: drawMinimap()]`. This divergence is deliberate: the minimap is a density picture, not a framing aid.

**REN-176** The minimap scale MUST be:

```
pad = 6
k_m = min( (w_m - pad*2) / max(1, maxX - minX),
           (h_m - pad*2) / max(1, maxY - minY) )
```

with **no clamp** — the minimap may scale arbitrarily small or large `[src: drawMinimap()]`.

**REN-177** The minimap offset MUST centre the extent:

```
ox = w_m / 2 - ((minX + maxX) / 2) * k_m
oy = h_m / 2 - ((minY + maxY) / 2) * k_m
```

`[src: drawMinimap()]`

**REN-178** Each node MUST be drawn as an axis-aligned **square** mark, filled in `nodeColour(n)` at global alpha `0.85`, with side `[src: drawMinimap()]`:

| Entity kind | Mark side (logical pixels) |
| --- | --- |
| `individual` | `1.2` |
| every other kind | `2` |

**REN-179** The mark MUST be centred on the projected node position: top-left at `(n.x * k_m + ox - s/2, n.y * k_m + oy - s/2)` `[src: drawMinimap()]`.

**REN-180** Minimap marks MUST NOT use the kind path. The minimap is the one place where shape is not the kind encoding, because a 1.2-pixel hexagon is meaningless. Colour and size carry what little distinction is possible at this size; the legend and the main Surface carry the real encoding.

**REN-181** Global alpha MUST be restored to `1` after the node marks and before the viewport rectangle `[src: drawMinimap()]`.

**REN-182** The **viewport rectangle** MUST be stroked in `palette.accent` at width `1`, showing the portion of world space currently visible on the main Surface `[src: drawMinimap()]`:

```
x0 = (-view.x / view.k) * k_m + ox
y0 = (-view.y / view.k) * k_m + oy
w  = (mainSurfaceLogicalWidth  / view.k) * k_m
h  = (mainSurfaceLogicalHeight / view.k) * k_m
```

**REN-183** The viewport rectangle MUST NOT be clipped to the minimap bounds. When the main view is zoomed out beyond the scene, the rectangle correctly extends past the minimap's edges and is simply cropped by the Surface `[src: drawMinimap()]`.

**REN-184** The minimap MUST be marked as decorative for assistive technology; it duplicates information available elsewhere and is not interactive in the reference build `[src: markup: .graph__minimap aria-hidden]`.

---

## 15. Export

> This is the section the user asked for by name. The point of export is that the user can see, outside the application, exactly what the application is drawing — and can prove what it was drawing, because the artefact states its own provenance.

### 15.1 Why export is not a screenshot

**REN-185** An export MUST NOT be a crop, capture or copy of the on-screen Surface's pixels. The on-screen Surface is device-pixel sized, clipped to a resizable panel, and shows only the part of the scene inside the current pan and zoom. The export path MUST render the whole scene again, off-screen, at a resolution chosen for the artefact `[src: renderExportCanvas()]`.

**REN-186** Export MUST reuse the same scene renderer as the on-screen path, with a different view transform and different options, rather than a parallel drawing routine. This is what guarantees that the export looks like the application `[src: renderExportCanvas()]`.

### 15.2 Scene bounds

**REN-187** Scene bounds MUST be the bounding box of all node positions inflated by each node's radius, then expanded by a uniform padding `[src: sceneBounds()]`:

```
1. x0 = min over nodes of (n.x - n.r) ; x1 = max over nodes of (n.x + n.r)
2. y0 = min over nodes of (n.y - n.r) ; y1 = max over nodes of (n.y + n.r)
3. if no finite bound: return null
4. p = pad ?? 80
5. return { x0: x0 - p, y0: y0 - p, x1: x1 + p, y1: y1 + p }
```

**REN-188** The default padding MUST be **80** world units, and **every export call site MUST pass 90** `[src: renderExportCanvas(), exportSVG()]`. The default of 80 is not exercised by the reference build's export paths; an implementation MUST use 90 for exports.

**REN-189** Scene bounds MUST NOT account for label rectangles, badges or cluster frames. A label on an extreme node may extend a little past the padded edge; the 90-unit pad is chosen to absorb this in practice.

**REN-190** `sceneBounds` MUST return a null result for an empty Viewport, and every caller MUST handle it by aborting the export `[src: sceneBounds(), renderExportCanvas(), exportSVG()]`.

### 15.3 Canvas dimensions

**REN-191** The export logical dimensions MUST be `[src: renderExportCanvas(), exportSVG()]`:

```
bw = max(320, bounds.x1 - bounds.x0)
bh = max(240, bounds.y1 - bounds.y0)
w  = round(bw)
h  = round(bh + EXPORT_HEADER + EXPORT_FOOTER)
```

**REN-192** The minimum scene dimensions MUST be **320 × 240** logical units, so a one-node export is still a usable picture `[src: renderExportCanvas(), exportSVG()]`.

**REN-193** The band constants MUST be exactly `[src: EXPORT_HEADER, EXPORT_FOOTER, EXPORT_MAX_PX]`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `EXPORT_HEADER` | `86` | Header band height in logical pixels |
| `EXPORT_FOOTER` | `58` | Footer band height in logical pixels |
| `EXPORT_MAX_PX` | `9000` | Maximum device pixels on either axis |

**REN-194** The header height MUST be added to the scene height and the scene MUST be shifted down by it, so the header band never overlaps graph content `[src: renderExportCanvas()]`.

### 15.4 Scale back-off

**REN-195** The requested scale MUST be reduced until the resulting pixel dimensions fit the resolution cap, using a multiplicative back-off `[src: renderExportCanvas()]`:

```
1. s = requestedScale
2. while ((w * s > EXPORT_MAX_PX or h * s > EXPORT_MAX_PX) and s > 0.35):
3.     s = s * 0.8
```

**REN-196** The back-off factor MUST be `0.8` and the floor MUST be `s > 0.35` `[src: renderExportCanvas()]`. The floor guarantees termination and means a sufficiently enormous scene will exceed the cap rather than be reduced to unreadability; this is the intended trade.

**REN-197** The achieved scale MUST be carried alongside the render target, because the filename and the completion report both need it `[src: renderExportCanvas(), exportPNG()]`.

### 15.5 The off-screen render target

**REN-198** The export render target MUST be created off-screen, at pixel dimensions `[src: renderExportCanvas()]`:

```
pixelWidth  = max(1, round(w * s))
pixelHeight = max(1, round(h * s))
```

**REN-199** The target's transform MUST be a uniform scale of `s`, so that all subsequent drawing is in the export's logical units `[src: renderExportCanvas()]`.

**REN-200** The export target MUST NOT be sized using the device pixel ratio. Export resolution is chosen by the user (2× or 3×), not by the display `[src: renderExportCanvas()]`.

### 15.6 The export view transform and scene render

**REN-201** The export scene render MUST be invoked with `[src: renderExportCanvas()]`:

| Option | Value | Rationale |
| --- | --- | --- |
| Logical size | `w`, `h` | Includes both bands |
| View transform | `{ x: -bounds.x0, y: -bounds.y0 + EXPORT_HEADER, k: 1 }` | Zoom fixed at 1; origin shifted so the padded scene starts below the header |
| Palette | current palette | Export follows the current theme |
| Hover | `null` | Emphasis MUST NOT appear in an artefact |
| Selection | current selection | The selection ring **is** part of what the user is looking at |
| Max labels | `4000` | See REN-135 |

**REN-202** The export view zoom MUST be exactly `1`. Every world-space stroke width therefore renders at its authored logical value, and the dot grid step is `34` (above the `11` threshold, so the grid **is** present in exports) `[src: renderExportCanvas(), renderScene()]`.

**REN-203** Because the export zoom is `1`, which exceeds every zoom threshold in this document (`0.42` for arrowheads, `0.3` for badges, `0.22` for cluster titles, `0.3235` for the grid), an export MUST include arrowheads, hidden-neighbour badges, cluster titles and the dot grid.

**REN-204** The export chrome MUST be drawn **after** the scene, so the header and footer bands cover any scene content that padding failed to keep clear `[src: renderExportCanvas()]`.

### 15.7 Header band

**REN-205** The header band MUST be filled with `palette.surface` across the full width, from `y = 0` to `y = EXPORT_HEADER` `[src: drawExportChrome()]`.

**REN-206** A **1-pixel rule** in `palette.divider` MUST be stroked at `y = EXPORT_HEADER + 0.5`. The half-pixel offset MUST be present so the rule lands on a pixel centre rather than straddling two `[src: drawExportChrome()]`.

**REN-207** The header content contract MUST be exactly three text runs `[src: drawExportChrome()]`:

| Run | Content | Font | Colour | Position | Alignment |
| --- | --- | --- | --- | --- | --- |
| Title | `<ontologyName> — graph view` | `600 20px` `palette.fontUI` | `palette.text` | `(28, 38)` | left, alphabetic |
| Caption | result of `exportCaption()` | `400 12px` `palette.fontMono` | `palette.textSec` | `(28, 62)` | left, alphabetic |
| Product | `Axiom Ontology Workbench` | `600 12px` `palette.fontUI` | `palette.textSec` | `(w - 28, 38)` | **right**, alphabetic |

**REN-208** The em dash in the title MUST be U+2014 surrounded by single spaces `[src: drawExportChrome()]`.

**REN-209** The ontology name MUST be read from the application's current ontology status field, falling back to the literal `pizza.owl` when unavailable `[src: drawExportChrome()]`.

**REN-210** The caption MUST be set in the **monospace** family, not the UI family. It is a data line and is meant to look like one `[src: drawExportChrome()]`.

**REN-211** The product name run MUST be right-aligned at `w - 28`, giving a symmetric 28-pixel gutter with the left-aligned runs `[src: drawExportChrome()]`.

### 15.8 The caption

**REN-212** The caption MUST be composed of exactly six fields joined by ` · ` (space, U+00B7 MIDDLE DOT, space), in this order `[src: exportCaption()]`:

| # | Field | Format | Example |
| --- | --- | --- | --- |
| 1 | Layout mode | display name + ` layout` | `Cluster grid layout` |
| 2 | Node count | grouped integer + ` nodes` | `1,000 nodes` |
| 3 | Relationship count | grouped integer + ` relationships` | `3,412 relationships` |
| 4 | Budget | `viewport budget ` + grouped integer | `viewport budget 1,000` |
| 5 | Hidden neighbours | grouped integer + ` neighbours held back` | `18,204 neighbours held back` |
| 6 | Timestamp | locale `en-GB`, 2-digit day, short month, numeric year, 2-digit hour, 2-digit minute | `11 Sep 2026, 14:32` |

```
exportCaption() =
    LAYOUT_NAMES[resolvedLayoutMode] + ' layout · ' +
    fmt(nodeCount) + ' nodes · ' +
    fmt(edgeCount) + ' relationships · ' +
    'viewport budget ' + fmt(budget) + ' · ' +
    fmt(totalHidden()) + ' neighbours held back · ' +
    timestamp
```

**REN-213** The Layout mode display names MUST be exactly `[src: LAYOUT_NAMES]`:

| Layout mode key | Display name |
| --- | --- |
| `force` | `Force-directed` |
| `hierarchy` | `Hierarchy` |
| `radial` | `Radial` |
| `grid` | `Cluster grid` |

**REN-214** The Layout mode named MUST be the **resolved** mode, not the user's selection. When the user has chosen `auto`, the caption MUST name what `auto` actually picked `[src: exportCaption()]`.

**REN-215** All integers in the caption MUST be grouped using `en-GB` conventions (comma thousands separator) `[src: fmt()]`.

**REN-216** The timestamp MUST be the moment the export is produced, not the moment the Viewport was last changed `[src: exportCaption()]`.

### 15.9 Footer band and legend

**REN-217** The footer band MUST be filled with `palette.surface` across the full width, from `y = h - EXPORT_FOOTER` to `y = h`, with a 1-pixel `palette.divider` rule at `y = h - EXPORT_FOOTER + 0.5` `[src: drawExportChrome()]`.

**REN-218** The legend MUST be drawn **with the real node shapes**, using the same shape construction as the graph. A legend drawn with generic swatches is non-conforming, because the entire kind encoding is shape `[src: drawExportChrome(), nodePath()]`.

**REN-219** The legend entry list MUST be derived from the Entity kind metadata in declaration order, and MUST contain exactly five entries `[src: legendEntries(), KIND_META]`:

| # | Kind key | Label | Shape | Colour source |
| --- | --- | --- | --- | --- |
| 1 | `class` | `Class` | rounded square | `palette.class` |
| 2 | `defined` | `Defined class` | rounded square | `palette.defined` |
| 3 | `individual` | `Individual` | circle | `palette.individual` |
| 4 | `objectProperty` | `Object property` | diamond | `palette.objectProperty` |
| 5 | `dataProperty` | `Data property` | hexagon | `palette.dataProperty` |

**REN-220** Each legend entry's colour MUST fall back to `palette.class` when the kind key is absent from the palette `[src: legendEntries()]`.

**REN-221** The legend layout MUST be `[src: drawExportChrome()]`:

```
1. y = h - EXPORT_FOOTER / 2            // vertical centre of the footer band
2. x = 28
3. for each legend entry L:
4.     draw the kind shape at centre (x + 7, y) with radius 6.5, filled L.colour
5.     draw L.label at (x + 20, y + 4), font '400 12px fontUI', colour palette.textSec
6.     x = x + 20 + measureText(L.label).width + 26
```

**REN-222** The legend mark radius MUST be **6.5** logical pixels; the mark centre MUST be 7 pixels right of the entry origin; the label MUST start 20 pixels right of the entry origin; the inter-entry gap MUST be 26 pixels `[src: drawExportChrome()]`.

**REN-223** The label baseline offset `+4` from the band centre optically centres 12 px text against the shape `[src: drawExportChrome()]`.

**REN-224** A right-aligned footer note MUST be drawn at `(w - 28, y + 4)` in `400 12px` `palette.fontUI`, `palette.textSec`, with exactly this text `[src: drawExportChrome()]`:

```
Dashed = rdf:type · solid = subClassOf and object properties · +n = neighbours outside the budget
```

**REN-225** The legend and footer note MAY collide on a narrow export. The reference build does not detect this. An implementation SHOULD suppress the footer note when the legend's advanced `x` would exceed `w - 28 - measureText(note).width`, and MUST NOT truncate the legend to make room. **Status:** specified, not implemented in the reference build.

### 15.10 Filename stem

**REN-226** The filename stem MUST be `[src: exportStem()]`:

```
'axiom-graph-' + resolvedLayoutMode + '-' + YYYY + MM + DD + '-' + HH + mm
```

with `MM`, `DD`, `HH` and `mm` zero-padded to two digits and `YYYY` unpadded, in **local time**.

**REN-227** The Layout mode component MUST be the resolved mode **key** (`force`, `hierarchy`, `radial`, `grid`), not the display name `[src: exportStem()]`.

**REN-228** Example stem: `axiom-graph-hierarchy-20260911-1432`.

**REN-229** The stem MUST NOT contain the ontology name, spaces, or any character that requires escaping in a Windows filename.

### 15.11 PNG export

**REN-230** PNG export MUST be offered at exactly two scales: **2×** (labelled for screen) and **3×** (labelled for print) `[src: wire(), exportMenu markup]`.

**REN-231** PNG export MUST abort with a user-facing message when the Viewport is empty. The message MUST be exactly `[src: exportPNG()]`:

```
Nothing in the viewport to export. Seed the graph first.
```

**REN-232** PNG export MUST show a progress message before rendering, exactly `Rendering the export…` (with U+2026), classified as informational `[src: exportPNG()]`.

**REN-233** The render MUST be deferred to the next frame boundary so the progress message paints before the blocking render begins `[src: exportPNG()]`.

**REN-234** The PNG filename MUST be `[src: exportPNG()]`:

```
exportStem() + '@' + (round(achievedScale * 10) / 10) + 'x.png'
```

The achieved scale, not the requested scale, MUST be used, so a backed-off export is honestly labelled. Example: `axiom-graph-force-20260911-1432@2x.png`.

**REN-235** On encoder failure the user MUST be told, with exactly `The browser could not encode the image.` — or the platform-appropriate equivalent naming the encoder `[src: exportPNG()]`.

**REN-236** On success the completion report MUST state the filename, the **pixel dimensions** and the **file size**, in exactly this shape `[src: exportPNG()]`:

```
Saved <name> — <pixelWidth> × <pixelHeight> px, <round(bytes / 1024)> KB.
```

The separator is an em dash with surrounding spaces; the dimension separator is U+00D7 MULTIPLICATION SIGN with surrounding spaces; the size is rounded to whole kibibytes. The message MUST be classified as informational.

**REN-237** The reported dimensions MUST be the **device pixel** dimensions of the render target (`round(w * s)` × `round(h * s)`), not the logical dimensions `[src: exportPNG()]`.

### 15.12 Clipboard copy

**REN-238** Clipboard copy MUST render at scale **2** using the same export path as PNG `[src: copyGraphImage()]`.

**REN-239** Clipboard copy MUST abort with exactly `Nothing in the viewport to copy.` when the Viewport is empty `[src: copyGraphImage()]`.

**REN-240** The image MUST be placed on the clipboard as **PNG** `[src: copyGraphImage()]`.

**REN-241** On success the report MUST be exactly `[src: copyGraphImage()]`:

```
Graph image copied to the clipboard at <pixelWidth> × <pixelHeight> px.
```

classified as informational.

**REN-242** Clipboard access MUST be assumed to be permission-gated and MUST be wrapped so that a refusal, a missing permission, an insecure context or an unsupported clipboard format is caught and reported rather than thrown. The failure path MUST NOT be distinguished by cause; every failure yields the same message `[src: copyGraphImage()]`.

**REN-243** The fallback message MUST be exactly `[src: copyGraphImage()]`:

```
The browser refused clipboard image access on this page. Use Export PNG instead — it saves to your downloads folder.
```

classified as a warning (not informational). A native implementation MUST substitute the platform equivalent of the first sentence while preserving the second sentence's structure: state the refusal, then name the working alternative and where it puts the file. See [Appendix A](#appendix-a--native-stack-mapping-non-normative).

### 15.13 SVG export

**REN-244** SVG export MUST abort with exactly `Nothing in the viewport to export.` when the Viewport is empty `[src: exportSVG()]`.

**REN-245** SVG export MUST use the same scene bounds (padding 90), the same `bw`/`bh` minima, the same `w`/`h` derivation and the same band constants as the raster path `[src: exportSVG()]`.

**REN-246** The scene offset MUST be `ox = -bounds.x0`, `oy = -bounds.y0 + EXPORT_HEADER`, applied as a single group translation `[src: exportSVG()]`.

**REN-247** The root element MUST carry `width`, `height`, a `viewBox` of `0 0 w h`, and a document-level UI font family `[src: exportSVG()]`:

```
font-family="Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
```

**REN-248** A full-bleed background rectangle in `palette.canvas` MUST be the first child `[src: exportSVG()]`.

**REN-249** SVG element order MUST be exactly `[src: exportSVG()]`:

```
 1. root <svg>
 2.   background <rect>
 3.   <g transform="translate(ox, oy)">        // world space
 4.     cluster frames + cluster titles        // grid mode only
 5.     radial rings                           // radial mode only
 6.     edges
 7.     nodes (shape, then Focus set ring)
 8.   </g>
 9.   label <text> elements                    // screen space, outside the group
10.   header band <rect>, footer band <rect>
11.   header rule <line>, footer rule <line>
12.   title, caption, product name <text>
13.   legend shapes + labels
14. </svg>
```

**REN-250** Node shapes MUST map to SVG primitives by Entity kind `[src: svgShape()]`:

| Entity kind | SVG element | Attributes |
| --- | --- | --- |
| `individual` | `<circle>` | `cx`, `cy`, `r`, `fill` |
| `objectProperty` | `<polygon>` | `points` = `(x, y-r) (x+r, y) (x, y+r) (x-r, y)`, `fill` |
| `dataProperty` | `<polygon>` | `points` = six vertices at `θ_i = π/6 + i·π/3`, `fill` |
| `class`, `defined`, other | `<rect>` | `x = cx - s`, `y = cy - s`, `width = height = 2s` where `s = r·0.92`, `rx = min(5, r·0.45)`, `fill` |

**REN-251** All SVG numeric coordinates MUST be emitted to **one decimal place** `[src: svgShape(), exportSVG()]`.

**REN-252** Edge paths MUST be constructed as `[src: exportSVG()]`:

| Routing | SVG |
| --- | --- |
| Elbow (hierarchy mode, `abs(a.y - b.y) > 24`) | `<path d="M ax ay V my H bx V by">` where `my = (a.y + b.y)/2` |
| Quadratic fan (`mn > 1`) | `<path d="M ax ay Q cx cy bx by">` with `cx`, `cy` from REN-85 |
| Straight | `<line x1 y1 x2 y2>` |

**REN-253** Every edge element MUST carry `fill="none"`, `stroke = palette.stroke`, `stroke-width` = `1.15` (structural) or `1` (incidental), and `stroke-opacity` = `0.72` (structural) or `0.48` (incidental) `[src: exportSVG()]`. These are the no-hover values from REN-77, as required by REN-103.

**REN-254** `rdf:type` edges MUST carry `stroke-dasharray="5 5"` `[src: exportSVG()]`. Note the absence of the `/k` division: the SVG is authored at `k = 1`.

**REN-255** Focus set rings in SVG MUST be `<circle>` elements at radius `n.r + 3`, `fill="none"`, `stroke = palette.text`, `stroke-width="1.8"` `[src: exportSVG()]`. Note that the SVG Focus ring is a circle for every Entity kind, whereas the canvas Focus ring follows the kind path (REN-70). **Known divergence**; an implementation SHOULD emit the kind path in SVG to match. **Status:** specified, not implemented in the reference build.

**REN-256** SVG export MUST **reuse the same label placement pass** as the raster path, invoked with a measurement-only drawing context, the SVG's logical size, the view transform `{ x: ox, y: oy, k: 1 }`, the current selection, a null hover, and a maximum of 4000 `[src: exportSVG(), placeLabels()]`. This is what makes raster and vector exports of the same Viewport show the same labels in the same places.

**REN-257** Label text elements MUST be emitted **outside** the world-space group, because the placement pass returns screen-space anchors that already include the offset `[src: exportSVG()]`.

**REN-258** Each label MUST be emitted as `[src: exportSVG()]`:

| Attribute | Value |
| --- | --- |
| `x` | `L.sx` to 1 dp |
| `y` | `L.sy + 11` to 1 dp |
| `text-anchor` | `middle` |
| `font-size` | `11` for Individuals, `12.5` otherwise |
| `font-weight` | `400` for Individuals, `600` otherwise |
| `fill` | `palette.text` |
| `stroke` | `palette.canvas` |
| `stroke-width` | `3.5` |
| `paint-order` | `stroke` |

**REN-259** The `+11` baseline offset converts the placement pass's top-aligned anchor into an SVG alphabetic baseline `[src: exportSVG()]`.

**REN-260** The halo MUST be produced by the **paint-order technique**: set both `stroke` and `fill` on the same text element and declare `paint-order="stroke"`, so the renderer strokes first and fills over it `[src: exportSVG()]`. An implementation MUST NOT duplicate the text element to fake a halo, because a duplicated element breaks text selection and doubles the accessible text.

**REN-261** All text content and all attribute values derived from data MUST be XML-escaped. The escape map MUST be exactly `[src: xmlEsc()]`:

| Character | Replacement |
| --- | --- |
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&apos;` |

**REN-262** Escaping MUST be applied to: node labels, cluster titles, the ontology name, the export title run and the export caption `[src: exportSVG()]`.

**REN-263** Note that the canvas escape helper used elsewhere in the application emits `&#39;` for the apostrophe, while the XML helper emits `&apos;`. The XML helper MUST be used for SVG `[src: xmlEsc(), esc()]`.

**REN-264** The SVG legend advance MUST use an **estimated** text width of `label.length * 6.6` rather than a measured width, because the SVG path has no measurement context at that point `[src: exportSVG()]`. This is a known divergence from the raster legend, which measures (REN-221). An implementation that has a measurement API available SHOULD measure in both paths.

**REN-265** The SVG output MUST be joined with newline separators and delivered with the media type `image/svg+xml` `[src: exportSVG()]`.

**REN-266** The SVG filename MUST be `exportStem() + '.svg'` `[src: exportSVG()]`.

**REN-267** The SVG completion report MUST be exactly `[src: exportSVG()]`:

```
Saved <name> — <grouped node count> nodes as vector shapes, editable in any vector tool.
```

classified as informational.

**REN-268** **Elements the reference SVG omits.** The SVG export does **not** emit: the dot grid, arrowheads, the defined-class overlay mark, the selection ring, Pin markers, or hidden-neighbour badges `[src: exportSVG()]`. An implementation MUST either reproduce these omissions or close all of them; a partial fix produces an artefact that is neither the reference nor complete. Closing them is RECOMMENDED, because REN-278 requires the export to be a faithful rendering, and the missing badges in particular undercut REN-280. **Status:** specified, not implemented in the reference build.

### 15.14 Delivery

**REN-269** Exported files MUST be delivered to the user's filesystem without a further prompt beyond the platform's own save UI, and the temporary handle MUST be released afterwards. In the reference build a blob URL is created, attached to a synthetic download anchor, clicked, detached, and revoked after 5 seconds `[src: downloadBlob()]`.

**REN-270** The 5-second revoke delay MUST be long enough for the platform to have read the blob. A native implementation SHOULD write the bytes directly and has no equivalent obligation; see [Appendix A](#appendix-a--native-stack-mapping-non-normative).

### 15.15 Export menu

**REN-271** The export menu MUST offer exactly four actions, in this order, with a separator before the clipboard action `[src: exportMenu markup, wire()]`:

| Label | Hint | Action |
| --- | --- | --- |
| `PNG, 2×` | `screen` | `exportPNG(2)` |
| `PNG, 3×` | `print` | `exportPNG(3)` |
| `SVG vector` | `editable` | `exportSVG()` |
| `Copy image to clipboard` | — | `copyGraphImage()` |

**REN-272** The menu MUST carry a heading stating `Export the graph exactly as laid out` and an explanatory note stating that every export carries a header naming the Layout mode, the node and relationship counts, the Budget, and how many neighbours the Budget is holding back `[src: exportMenu markup]`.

---

## 16. Export requirements

These four statements are the contract an export makes with the user. They are separated out because they are the acceptance criteria, not the mechanism.

**REN-273** An export **MUST be a faithful rendering of the current Viewport**. Every node in the Viewport MUST appear; no node outside it MUST appear. Positions, shapes, colours, edge routing and label placement MUST be produced by the same code paths as the on-screen render, differing only in the view transform, the label maximum, the suppressed hover and the added chrome `[src: renderExportCanvas(), renderScene()]`.

**REN-274** An export **MUST state the Layout mode and both the in-view and held-back counts**. The header caption MUST name the resolved Layout mode, the in-view node count, the in-view relationship count, the Budget, and the total Hidden neighbour count `[src: exportCaption()]`. An export that shows 1,000 nodes without saying that 18,000 neighbours were held back is a misleading artefact and is non-conforming.

**REN-275** An export **MUST NOT be a crop of the on-screen panel**. It MUST be rendered off-screen at its own dimensions, derived from scene bounds rather than from the panel's box, and MUST NOT inherit the panel's pan, zoom or clipping `[src: renderExportCanvas(), sceneBounds()]`.

**REN-276** An export **MUST be reproducible for the same Viewport state**. Given identical node positions, an identical edge set, an identical Focus set, an identical selection, an identical resolved Layout mode, an identical theme and an identical requested scale, two exports MUST be pixel-identical except for the timestamp field in the caption `[src: renderExportCanvas(), exportCaption()]`.

**REN-277** Corollary to REN-276: the export path MUST NOT introduce randomness, MUST NOT depend on frame timing, MUST NOT depend on the physical display's pixel ratio (REN-200), and MUST NOT depend on whether the user happened to be hovering a node (REN-103, REN-201).

**REN-278** Corollary to REN-273: where the reference build's SVG path omits elements the raster path draws (REN-268), the raster path is the conformance reference for faithfulness.

---

## 17. Accessibility

**REN-279** The graph Surface MUST carry an accessible name. The reference name is exactly `[src: canvas markup]`:

```
Ontology graph. Use the hierarchy or the table to add entities to the view.
```

The name MUST do double duty: it identifies the Surface and it tells a non-visual user where the equivalent functionality lives.

**REN-280** The graph Surface MUST be keyboard-reachable — it MUST be in the tab order and MUST accept key events directly `[src: canvas markup, wireCanvas()]`.

**REN-281** Because a drawn Surface exposes no per-node structure to assistive technology, the application MUST provide an equivalent non-visual route to every graph affordance. In the reference build the class tree and the individuals table are that route; see [Class tree and inspector](30-class-tree-and-inspector.md) and [Individuals table](31-individuals-table.md).

**REN-282** Every piece of information the renderer encodes in colour MUST also be encoded non-chromatically:

| Information | Colour encoding | Required non-colour encoding |
| --- | --- | --- |
| Entity kind | five hues | five distinct shapes (REN-63, REN-64) |
| Defined class | distinct hue | the plus overlay mark (REN-72) |
| Structural vs incidental edge | none | stroke weight and opacity (REN-77) |
| `rdf:type` edge | none | dash pattern (REN-79) |
| Pinned | `palette.warn` dot | position (upper-left marker) and the legend entry |
| Focus set | none | the kind-path ring (REN-70) |
| Selection | `palette.accent` | the circular ring, which differs in shape from the Focus ring (REN-69) |
| Hidden neighbours | none | the `+n` numeral (REN-149) |

**REN-283** The hover tooltip MUST carry the node's label, its Entity kind display name, and its Hidden neighbour count when non-zero, so the information in the badge is available as text `[src: wireCanvas(), KIND_META]`.

**REN-284** Under a reduced-motion preference the application MUST suppress or reduce to near-zero every transition and animation in the surrounding chrome `[src: CSS @media (prefers-reduced-motion: reduce)]`.

**REN-285** Under a reduced-motion preference the renderer SHOULD additionally stop the continuous force simulation from animating node positions, settling to a final layout without visible motion, and MUST leave the freeze control available so the user can stop motion manually `[src: frame(), stepLayout()]`. The reference build suppresses chrome transitions but does not gate the simulation on the preference. **Status:** specified, not implemented in the reference build.

**REN-286** The minimap MUST be hidden from assistive technology as decorative (REN-184).

**REN-287** Export completion and failure reports MUST be announced through a live region so that a non-visual user learns the filename, dimensions and size `[src: showToast(), trace markup role="status" aria-live="polite"]`.

**REN-288** Status messages MUST persist long enough to be read. The reference dismissal delay is **6000 ms** `[src: showToast()]`.

---

## 18. Performance

### 18.1 Per-frame budget

**REN-289** At the Budget's default ceiling of **1,000 nodes**, a full frame — background, grid, rings or frames, edges, nodes, cluster titles, label placement, labels, badges and minimap — MUST complete within **16 ms** on the reference hardware class, so the Surface holds 60 frames per second while the force simulation is running `[src: G.budget, frame()]`.

**REN-290** The frame loop MUST be a single continuous cycle of "step layout, then draw", driven by the display's refresh callback `[src: frame()]`. It MUST NOT run two independent loops for layout and drawing.

**REN-291** The renderer MUST NOT skip frames when the layout is frozen; it MUST keep drawing, because pan, zoom, hover and selection all change the picture without changing the model.

**REN-292** An implementation MAY add a dirty-flag optimisation that skips the draw when nothing has changed, provided hover, selection, pan, zoom, theme and Surface size are all treated as inputs that dirty the frame. **Status:** specified, not implemented in the reference build.

### 18.2 Allocation discipline

**REN-293** The draw loop MUST NOT allocate per node or per edge. Specifically it MUST NOT, inside the node or edge loop: build strings, read Design tokens, construct colour objects, allocate arrays, or create closures `[src: renderScene()]`.

**REN-294** Palette values MUST be read once per theme change (REN-28) and held as primitives.

**REN-295** The hover neighbour set MUST be built once per frame, not once per node (REN-97).

**REN-296** The badge pass allocates one string per badged node (the abbreviated numeral). This is bounded by the number of nodes with Hidden neighbours and is accepted. An implementation SHOULD cache the abbreviation keyed by the count `[src: renderScene()]`.

**REN-297** The label placement pass allocates one rectangle and one result record per accepted label, plus the spatial hash. This is the dominant allocation in the frame and MUST be kept to that.

### 18.3 The cost of the label pass

**REN-298** The label pass is the most expensive part of the frame and implementers MUST budget for it accordingly. Its cost has three components `[src: placeLabels()]`:

| Component | Cost | Notes |
| --- | --- | --- |
| Sort | `O(n log n)` over all Viewport nodes | Runs every frame, on the full node set, even for nodes that will be culled |
| Text measurement | One measurement per **non-culled** candidate | Text measurement is the single most expensive call in the pass on every platform |
| Overlap test | Roughly `O(1)` amortised per candidate | The `B = 96` hash keeps the examined set small; worst case is a dense pile-up in one cell |

**REN-299** The cull (REN-124) MUST be applied **before** measurement, not after, because measurement is the expensive step `[src: placeLabels()]`.

**REN-300** The maximum-label cap (REN-134) MUST break the loop, not filter the output, so that a 1,000-node view stops measuring after 900 accepted labels `[src: placeLabels()]`.

**REN-301** An implementation SHOULD cache measured text widths keyed by `(text, font)`. Node labels are stable across frames and the same string is measured every frame; a cache removes the dominant cost. **Status:** specified, not implemented in the reference build.

**REN-302** An implementation MUST NOT optimise the label pass by sorting less often, caching the accepted set across frames, or placing labels only for a sampled subset. Each of these makes the visible label set flicker under pan, which is worse than the cost it saves.

**REN-303** The export label pass runs with a maximum of 4000 (REN-135) and is therefore several times more expensive than a frame's pass. This is acceptable because it runs once, off the frame loop, behind a progress message (REN-232).

### 18.4 Other cost notes

**REN-304** The dot grid is a nested loop over screen positions and its iteration count grows as `1/k²` as the user zooms out. The `step > 11` threshold (REN-53) caps the count at roughly `(w/11) × (h/11)` marks, which for a 1600 × 900 panel is about 11,900 fills. Implementations MUST keep this threshold; removing it makes zoom-out quadratically expensive.

**REN-305** The minimap redraws in full every frame. At 180 × 120 with 1,000 one- or two-pixel marks this is negligible, but an implementation MAY throttle it to every second frame. **Status:** specified, not implemented in the reference build.

**REN-306** The device pixel ratio cap of 2 (REN-37) exists for fill cost. At a 3× ratio a full-Surface background fill and grid pass cost 2.25× more than at 2× for no perceptible gain on a Windows display at typical viewing distance.

---

## Appendix A — Native stack mapping (non-normative)

Nothing in this appendix is normative. It records how the framework-neutral model above lands on a Windows 11 desktop stack, so that an implementer does not have to rediscover it.

### A.1 Render surface

| Option | Fit for this renderer | Notes |
| --- | --- | --- |
| **Win2D** (`CanvasControl` / `CanvasVirtualControl`) | Good | Direct2D under a WinRT surface. `CanvasDrawingSession` maps almost one-to-one onto the immediate-mode model used above: `DrawLine`, `FillGeometry`, `DrawText`, `Transform`. Natively WinUI 3. DPI handling via `CanvasControl.DpiScale`. |
| **SkiaSharp** (`SKCanvas`, via `SKXamlCanvas` or `SKGLControl`) | Good, most portable | `SKCanvas.Save/Translate/Scale/Restore` maps exactly onto the two-space model. `SKPaint.PathEffect = SKPathEffect.CreateDash` for the `rdf:type` dash. `SKPaint.Style = Stroke` plus a second fill paint reproduces the label halo directly. Cross-platform if that ever matters. |
| **Direct2D / DirectWrite** (raw) | Best performance, most work | `ID2D1DeviceContext::SetTransform` for the world block; `ID2D1RoundedRectangleGeometry` for the class shape; `ID2D1PathGeometry` for diamond and hexagon; `ID2D1StrokeStyle` with a custom dash array. Requires manual device-lost handling. |
| **WinUI `Shape` elements / retained XAML** | Poor | A retained scene graph of 1,000 nodes plus 3,000 edges plus 900 text elements will not hold 60 fps and defeats the per-frame greedy label pass. Not recommended. |

Recommendation: **Win2D** for a WinUI 3 shell, **SkiaSharp** if the shell may change.

### A.2 Shape construction

- Rounded square (REN-64): Win2D `CanvasGeometry.CreateRoundedRectangle`; Skia `SKRoundRect`; Direct2D `CreateRoundedRectangleGeometry`. All three take a corner radius directly, so the four-arc construction of REN-61 is only needed where a rounded-rect primitive is unavailable.
- Diamond and hexagon: build a closed polygon once per radius bucket and cache the geometry. Both are cheap, but Direct2D geometry creation is not free and 1,000 per frame is wasteful.
- The defined-class plus mark: two `DrawLine` calls in the background brush; no geometry needed.

### A.3 Text measurement and layout

| Need | Win2D | SkiaSharp | Direct2D |
| --- | --- | --- | --- |
| Measure advance width | `CanvasTextLayout.LayoutBounds` / `DrawBounds` | `SKPaint.MeasureText` or `SKFont.MeasureText` | `IDWriteTextLayout::GetMetrics` |
| Fixed point size | `CanvasTextFormat.FontSize` | `SKFont.Size` | `IDWriteTextFormat` size |
| Weight 400 / 600 | `CanvasTextFormat.FontWeight` | `SKFontStyleWeight.Normal` / `SemiBold` | `DWRITE_FONT_WEIGHT_NORMAL` / `SEMI_BOLD` |
| Centre alignment | `CanvasHorizontalAlignment.Center` | draw at `x - width/2`, or `SKTextAlign.Center` | `DWRITE_TEXT_ALIGNMENT_CENTER` |
| Halo | draw the layout twice: once with a stroke brush via `CanvasGeometry.CreateText` + `DrawGeometry`, then `DrawTextLayout` | `SKPaint{Style=Stroke, StrokeWidth=3.5, StrokeJoin=Round}` then `Style=Fill` | `CreateGeometryFromTextLayout` then `DrawGeometry` + `FillGeometry` |

Notes:

- `LayoutBounds` in Win2D includes leading and trailing whitespace and is what you want for a reserved rectangle; `DrawBounds` is the ink extent and is not.
- `CanvasTextLayout` allocates. Cache it per `(text, font)` — this is exactly the cache recommended by REN-301, and on Win2D it is close to mandatory to hit the budget of REN-289.
- Segoe UI Variable is the Windows 11 UI face and is the intent behind the `--font-ui` token stack. Cascadia Mono is the intent behind `--font-mono`.
- The fixed label rectangle height of 16 (REN-123) means you do not need line metrics — only the advance width.

### A.4 Off-screen render targets for export

| Stack | Target type | Notes |
| --- | --- | --- |
| Win2D | `CanvasRenderTarget(device, w, h, dpi)` | Pass DPI 96 and apply the export scale as a transform, or pass `96 * s` and draw in logical units. The second is cleaner and matches REN-199. |
| SkiaSharp | `SKSurface.Create(new SKImageInfo(pw, ph))` | Then `canvas.Scale(s)`. Use `SKColorType.Rgba8888` with `SKAlphaType.Premul`. |
| Direct2D | `ID2D1DeviceContext::CreateBitmap` with `D2D1_BITMAP_OPTIONS_TARGET` | Or WIC bitmap render target for a CPU path. |

The 9000-pixel cap of REN-193 sits comfortably below the Direct2D maximum bitmap dimension on Feature Level 11 hardware (16384), so the back-off loop of REN-195 is a product decision about file size, not a hardware limit. Keep it anyway: a 9000 × 9000 RGBA surface is 324 MB before compression.

### A.5 PNG encoding

| Stack | API |
| --- | --- |
| Win2D | `CanvasRenderTarget.SaveAsync(stream, CanvasBitmapFileFormat.Png)` |
| SkiaSharp | `surface.Snapshot().Encode(SKEncodedImageFormat.Png, 100)` |
| WIC (raw) | `IWICImagingFactory::CreateEncoder(GUID_ContainerFormatPng, …)` |
| .NET | `System.Drawing` — avoid; not supported on all Windows deployment models and has no advantage here |

For REN-236 the file size is the encoded byte length, available from the stream length after encoding. Report in KB as `bytes / 1024` rounded, matching the reference.

### A.6 SVG emission

There is no Windows SVG *writer* in the platform. Emit the markup by hand, as the reference does. Practical notes:

- Use invariant-culture number formatting with one decimal place (REN-251). A comma decimal separator under a European locale silently corrupts every coordinate — this is the single most common bug in hand-rolled SVG emitters on Windows.
- `paint-order="stroke"` (REN-260) is SVG 2 and is honoured by Edge, Chrome, Firefox, Safari, Inkscape and Illustrator. It is the correct technique; do not substitute duplicated text.
- Write UTF-8 without a BOM and declare nothing beyond the `xmlns` attribute; no DOCTYPE is needed for SVG 1.1 or 2.
- To verify REN-256 (shared placement), run the placement pass with a measurement-only text context. On Win2D this is a `CanvasTextLayout` against a `CanvasDevice` with no target; on Skia it is a bare `SKFont`. Neither requires a surface.
- If the SVG omissions of REN-268 are closed, arrowheads are best emitted as explicit `<polygon>` elements rather than `<marker>`, because the direction vector is already computed and markers introduce orientation edge cases on quadratic paths.

### A.7 Clipboard image formats on Windows

| Format | Constant | Recommendation |
| --- | --- | --- |
| PNG | registered clipboard format `"PNG"` | Primary. Preserves alpha; accepted by Office, Teams, Slack, browsers and every modern image editor. |
| DIB v5 | `CF_DIBV5` | Offer alongside PNG. Some older Win32 targets accept only this. Alpha handling is inconsistent across consumers; composite against the canvas colour before writing. |
| DIB | `CF_DIB` | Legacy fallback; no alpha. |
| Bitmap | `CF_BITMAP` | Avoid; GDI handle ownership is awkward. |

WinRT path: `Windows.ApplicationModel.DataTransfer.DataPackage.SetBitmap(RandomAccessStreamReference)`, then `Clipboard.SetContent`. WinUI 3 on the desktop can also use `Clipboard.SetContentWithOptions`.

Failure modes to map onto the single fallback message of REN-243:

- Clipboard locked by another process — `Clipboard.SetContent` throws `COMException` with `CLIPBRD_E_CANT_OPEN` (0x800401D0). This is common and transient; a single silent retry after ~50 ms is reasonable before reporting.
- No desktop window / running under a service or elevated-mismatch context.
- Stream materialisation failure for very large images.

The reference message names the browser; a native build should name the platform, for example: *"Windows refused clipboard access — another application is holding the clipboard. Use Export PNG instead — it saves to your downloads folder."* Preserve the two-sentence structure: state the refusal, then name the working alternative and where the file lands.

### A.8 File delivery

Replace the blob-URL dance of REN-269 with a real save. Use `Windows.Storage.Pickers.FileSavePicker` with the stem from REN-226 as `SuggestedFileName` and the appropriate `FileTypeChoices` entry (`.png` or `.svg`). Where the product prefers a silent save, write to `UserDataPaths.GetDefault().Downloads` and report the full path in the completion message of REN-236 — the user needs to be told where it went, which is the point of naming the downloads folder in REN-243.

### A.9 Theme change

Windows theme changes arrive as `UISettings.ColorValuesChanged` (off the UI thread — marshal it) or, in WinUI, as `FrameworkElement.ActualThemeChanged`. Hook either to the palette refresh of REN-29, and make sure it runs before the next frame rather than being deferred, or one frame will draw light geometry on a dark ground.

### A.10 Device pixel ratio

`XamlRoot.RasterizationScale` (WinUI 3) or `DisplayInformation.LogicalDpi / 96` gives the ratio for REN-37. Watch for the value changing when the window moves between monitors: subscribe to `XamlRoot.Changed` and re-run the backing-store sizing of REN-36. Win2D's `CanvasControl` handles this itself if `DpiScale` is left at its default, in which case REN-40's "author in logical units" falls out for free.

---

## Related documents

- [Architecture](10-architecture.md) — where the renderer sits in the process
- [Data model and Store](11-data-model-and-store.md) — Entity kinds and predicates
- [Graph viewport and budget](20-graph-viewport-and-budget.md) — admission, Eviction, expansion, interaction
- [Layout algorithms](21-layout-algorithms.md) — how positions, cluster frames and radial rings are computed
- [Design system](40-design-system.md) — the Design tokens this renderer reads
- [Component library](41-component-library.md) — the toolbar, menu and status surfaces that drive export
- [Visual reference](50-visual-reference.html) — rendered specimens of every shape, edge class and badge
- [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md) — the conformance suite for this document
- [Pizza ontology fixture](62-pizza-ontology-fixture.md) — the `pizza:` fixture used by the rendering tests
