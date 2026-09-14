# Layout Algorithms

**Purpose.** This document specifies the four graph layout engines and the automatic mode-selection heuristic that chooses between them, in enough detail to reimplement each one exactly, including every constant, every iteration count, every tie-break and every degenerate case.

**Status:** Normative

**Owned prefixes:** `LAY`

**Owns:** Layout mode selection, the relayout contract, parallel edge indexing, centring, the force-directed engine (Barnes–Hut, links, collisions, alpha schedule, pre-seed), the layered hierarchy engine, the radial tree engine, the cluster grid engine, layout determinism, and the decoration records layouts publish for the renderer.

**Does not own:** what enters the Viewport and what leaves it — see [Graph viewport and Budget](20-graph-viewport-and-budget.md). Drawing, colour, label placement, edge styling and export — see [Rendering and export](22-graph-rendering-and-export.md).

**Terminology note.** Throughout this document, *node* means a viewport node record as defined in [Graph viewport and Budget, §2](20-graph-viewport-and-budget.md#2-the-viewport-node-record), and *edge* means a viewport edge record as defined in [§3](20-graph-viewport-and-budget.md#3-the-edge-record-and-edge-keying). Positions are in **world units**; the camera is not a layout concern.

---

## 1. Layout mode selection

### 1.1 The five modes

**LAY-1.** Exactly five Layout mode values MUST be offered to the user: `auto`, `force`, `hierarchy`, `radial`, `grid` `[src: gLayoutMode]`. Four of them are engines; `auto` is a heuristic that resolves to one of the four.

| Value | Display name | Engine |
|---|---|---|
| `auto` | Auto layout | resolves to one of the four below |
| `force` | Force-directed | Barnes–Hut n-body with Hooke links and hard collision resolution `[src: layoutForce()]` |
| `hierarchy` | Hierarchy | Sugiyama layering `[src: layoutHierarchy()]` |
| `radial` | Radial | tidy radial tree `[src: layoutRadial()]` |
| `grid` | Cluster grid | type-clustered packed grids `[src: layoutGrid()]` |

Display names are held in a single table and MUST be used verbatim in the status bar, the freeze-control explanation and the layout timing trace `[src: LAYOUT_NAMES]`.

**LAY-2.** Two distinct values MUST be tracked: the user's **choice** (one of the five) and the **resolved** mode (one of the four) `[src: G]`. Every consumer that behaves differently per engine — the freeze control, the status readout, the animation rule — MUST read the resolved mode, never the choice.

**LAY-3.** The status readout MUST show the resolved mode's display name and MUST append `" (auto)"` when the user's choice is `auto` `[src: relayout()]`. A user who did not pick hierarchy must be able to see that the product picked it, and that it was a decision rather than a setting.

**LAY-4.** The default user choice MUST be `auto`, and the initial resolved mode MUST be `force` `[src: G, gLayoutMode]`.

**LAY-5.** Changing the Layout mode MUST run a **fresh** layout, fit the view, refresh the reported counts, and emit an information trace naming the resolved mode, the node count, the edge count and the elapsed milliseconds `[src: gLayoutMode]`:

> *"{Layout mode} layout over {n} nodes and {m} relationships in {ms} ms."*

### 1.2 The `auto` heuristic

**LAY-6.** When the user's choice is not `auto`, resolution MUST return that choice unchanged, without inspecting the view `[src: chooseLayout()]`.

**LAY-7.** When the choice is `auto`, resolution MUST test the following conditions **in this order** and MUST return on the first that holds `[src: chooseLayout()]`:

```
chooseLayout():
  1. if choice ≠ "auto": return choice

  2. n ← node count
  3. if n = 0: return "force"

  4. edges ← viewEdges()                       // both endpoints resident
  5. hier  ← count of e in edges with e.pred in HIER_PREDS
  6. typed ← count of e in edges with e.pred = rdf:type
  7. ratio ← hier / |edges|   when |edges| > 0, else 0

  8. if n > 300 and |edges| > 0 and typed / |edges| > 0.55:  return "grid"
  9. if n > 500:                                             return "grid"
 10. if |edges| >= n * 0.5 and ratio > 0.78 and n <= 400:     return "hierarchy"
 11. if |focus| <= 2 and n > 14:                              return "radial"
 12. return "force"
```

**LAY-8.** The hierarchy predicate set used at line 5 MUST be exactly `{ rdfs:subClassOf, rdfs:subPropertyOf, rdf:type }` `[src: HIER_PREDS]`. It is shared with the hierarchy engine ([§6](#6-hierarchy-sugiyama)) and with the force engine's rest-length rule ([§5.5](#55-the-link-force)), and MUST be defined once.

**LAY-9.** All counts MUST be taken over `viewEdges()` — edges whose endpoints are both resident — never over the raw edge map `[src: viewEdges()]`. Counting an edge whose endpoint has been evicted would let a stale relationship change the drawing of a view it is no longer part of.

#### Constants

| Constant | Value | Used at |
|---|---|---|
| Type-dominance threshold | `0.55` | line 8 |
| Type-dominance node floor | `300` | line 8 |
| Unconditional grid floor | `500` | line 9 |
| Edge-density floor | `0.5 × n` | line 10 |
| Hierarchy-dominance threshold | `0.78` | line 10 |
| Hierarchy node ceiling | `400` | line 10 |
| Radial focus ceiling | `2` | line 11 |
| Radial node floor | `14` | line 11 |

### 1.3 The reasoning behind each branch

**LAY-10.** The order of the tests MUST be preserved exactly, because the branches overlap and the order encodes their priority. Each branch answers a different question about the shape of what is actually on screen.

**Line 3 — the empty view resolves to force.** There is nothing to lay out, and force is the mode whose freeze control is meaningful, so the toolbar does not arrive in a disabled state before the user has done anything.

**Line 8 — a large view dominated by `rdf:type` edges wants clustering.** When more than 55 per cent of the visible relationships are `rdf:type`, the view is not a *structure*; it is a **population**. Six hundred Individuals hanging off `demo:Order` have no interesting topology at all — every one of them has exactly the same relationship to exactly the same class. A force simulation on that shape produces a hairball whose only readable feature is the hub, at a cost of `O(n log n)` per tick forever. A grid produces an aligned block whose *size* is instantly legible and whose members can be scanned in reading order. The source says it plainly: *"When a thousand individuals of one class arrive, relaxation is just noise; alignment is not."* `[src: layoutForce() comment block]` The node floor of 300 exists because a small typed view still reads well as a force graph; clustering twelve Individuals into a grid block is pointless ceremony.

**Line 9 — a very large view wants clustering regardless of shape.** Above 500 nodes, nothing else reads. Relaxation cannot separate that many nodes within a screen, hierarchy produces rows hundreds of nodes wide, and radial produces rings so dense the wedges collapse. Grid is the only one of the four whose legibility does not degrade with population, because it never tries to encode topology in position — it encodes *grouping* in position, and grouping is exactly what survives at scale.

**Line 10 — a view that is mostly subclass edges wants a layered drawing.** Three conditions must hold together. `ratio > 0.78` says at least 78 per cent of the visible relationships are taxonomic, so the view really is a taxonomy and not a taxonomy with a lot of other things attached. `|edges| >= n × 0.5` says the view is *connected enough* to layer: a set of nodes with almost no edges has no hierarchy to draw, and Sugiyama would produce one enormous row. `n <= 400` says the view is small enough that rows stay narrower than a screen. When all three hold, layering is strictly better than force: subclass depth becomes the vertical axis, siblings become adjacent, and the taxonomy can be *read* rather than traced.

**Line 11 — a single-focus exploration wants a radial tree.** `|focus| <= 2` means the user is exploring outward from one or two things — the classic "what is around this?" gesture. Radial is the layout that answers that question directly: the focus sits at the centre, distance from the focus becomes distance from the centre, and the eye reads hop count off the rings without counting edges. The floor of `n > 14` exists because below fifteen nodes the rings are more ceremony than help and force gives a more natural picture.

**Line 12 — everything else wants force.** Force is the general case and the honest default: it makes no claim about the shape of the data. A mixed view — some subclasses, some restrictions, some instances, two or three focal points — has no dominant structure to exploit, and a general-purpose relaxation is the correct answer.

**LAY-11.** The heuristic MUST be re-evaluated on every relayout, not cached. A view that begins as a small taxonomy and grows into a population MUST switch modes as it grows, and MUST say so in the status readout (**LAY-3**).

### 1.4 Worked example of the heuristic

**Subgraph T8 — the topping spine.** Defined for this document as these eight classes and seven `rdfs:subClassOf` edges, all of which exist in the fixture `[src: CLASS_SPEC]`:

```
pizza:PizzaTopping
  ├── pizza:CheeseTopping
  │     ├── pizza:MozzarellaTopping
  │     └── pizza:ParmesanTopping
  └── pizza:VegetableTopping
        ├── pizza:PepperTopping
        │     └── pizza:GreenPepperTopping
        └── pizza:TomatoTopping
```

Evaluation: `n = 8`, `|edges| = 7`, `hier = 7`, `typed = 0`, `ratio = 7/7 = 1.0`.

| Line | Test | Result |
|---|---|---|
| 8 | `8 > 300` | false |
| 9 | `8 > 500` | false |
| 10 | `7 >= 4.0` ✓, `1.0 > 0.78` ✓, `8 <= 400` ✓ | **hierarchy** |

**Subgraph M — the Margherita neighbourhood.** Defined as these five entities and four edges, all present in the fixture `[src: NAMED_PIZZAS, buildTBox()]`:

```
pizza:Margherita —rdfs:subClassOf→       pizza:NamedPizza
pizza:Margherita —pizza:hasTopping→      pizza:MozzarellaTopping
pizza:Margherita —pizza:hasTopping→      pizza:TomatoTopping
pizza:Margherita —pizza:hasCountryOfOrigin→ pizza:Italy
```

Evaluation with `focus = { pizza:Margherita }`: `n = 5`, `|edges| = 4`, `hier = 1`, `typed = 0`, `ratio = 0.25`.

| Line | Test | Result |
|---|---|---|
| 8 | `5 > 300` | false |
| 9 | `5 > 500` | false |
| 10 | `4 >= 2.5` ✓ but `0.25 > 0.78` ✗ | false |
| 11 | `1 <= 2` ✓ but `5 > 14` ✗ | false |
| 12 | — | **force** |

---

## 2. The relayout contract

### 2.1 The structural signature

**LAY-12.** A structural signature MUST be computed as the tuple of node count, edge count, structural revision counter and the user's Layout mode choice, joined with a separator `[src: layoutKey()]`:

```
layoutKey() = nodeCount + ":" + edgeCount + ":" + revision + ":" + choice
```

**LAY-13.** The signature MUST include the revision counter, not only the counts. Counts alone are insufficient: admitting one node while evicting one node leaves both counts unchanged but the graph completely different. The revision counter is bumped on every structural mutation — admission, removal, clear, budget-lowering — precisely so the signature moves `[src: addToView(), removeFromView()]`. See [Graph viewport and Budget, §5](20-graph-viewport-and-budget.md#5-admission).

**LAY-14.** The signature MUST NOT include camera state, selection, hover, pin flags, node positions, alpha or the resolved mode. None of those change the graph; recomputing a layout because the user panned would be both wasteful and visually violent.

**LAY-15.** The last-applied signature MUST be stored, and the layout MUST be recomputed whenever the current signature differs from it `[src: stepLayout(), layoutSig]`:

```
stepLayout():
  1. if layoutKey() ≠ layoutSig: relayout({ fresh: false })
  2. if resolvedMode = "force" and layoutOn: forceTick(sync = false)
```

**LAY-16.** The signature check MUST run once per frame and MUST be cheap — four scalars and a comparison. It MUST NOT walk the node or edge collections.

### 2.2 The relayout procedure

**LAY-17.** Relayout MUST be implemented as follows `[src: relayout()]`:

```
relayout(opts):
  1. mode ← chooseLayout()
  2. resolvedMode ← mode
  3. radialRings ← null                  // reset decorations owned by other engines
  4. groupBlocks ← empty
  5. layoutSig  ← layoutKey()            // record BEFORE dispatch
  6. indexEdges()                        // parallel-edge multiplicity, always
  7. if nodeCount > 0:
  8.     if mode = "hierarchy": layoutHierarchy()
  9.     else if mode = "radial": layoutRadial()
 10.     else if mode = "grid":   layoutGrid()
 11.     else:                    layoutForce(fresh = (opts.fresh = true))
 12. update the status readout per LAY-3
 13. set the freeze control's enabled state and explanation per LAY-24
```

**LAY-18.** Decoration state owned by engines other than the one about to run MUST be reset before dispatch (lines 3 and 4). The radial ring radii and the grid group frames are drawn by the renderer whenever present; leaving a previous mode's decorations in place would draw rings around a grid.

**LAY-19.** The signature MUST be recorded *before* the engine runs (line 5), not after. Engines do not mutate node or edge counts, so the values are identical either way — but recording first means a re-entrant or failing engine cannot leave the signature stale and cause an infinite relayout loop.

**LAY-20.** Parallel-edge indexing MUST run on every relayout, for every mode (line 6). It is a property of the edge set, not of any engine, and the renderer reads it regardless of mode. See [§3](#3-parallel-edge-indexing).

**LAY-21.** An empty Viewport MUST skip engine dispatch entirely (line 7) but MUST still update the signature, the decorations and the controls.

### 2.3 Fresh versus incremental

**LAY-22.** Two relayout kinds MUST exist, and the distinction MUST apply **only** to the force engine `[src: relayout(), layoutForce()]`:

| Kind | Trigger | Force engine behaviour |
|---|---|---|
| **fresh** | explicit re-layout (`L` key, toolbar button), layout mode change, seeding | Positions are discarded and re-seeded by phyllotaxis; velocities zeroed; alpha set to 1; a warm-up loop runs to completion; alpha left at `0.05` `[src: layoutForce()]` |
| **incremental** | the signature moved because nodes or edges changed | Positions and velocities are kept; alpha is raised to at least `0.5` and the simulation continues from where it was `[src: layoutForce()]` |

**LAY-23.** For hierarchy, radial and grid, fresh and incremental MUST be identical: all three recompute every position from scratch on every run, and neither reads nor preserves any previous position or velocity `[src: layoutHierarchy(), layoutRadial(), layoutGrid()]`.

**LAY-24.** What a fresh force layout resets, exactly:

- Every non-pinned node's `x` and `y` are overwritten by the phyllotaxis formula of [§5.9](#59-the-deterministic-pre-seed).
- Every non-pinned node's `vx` and `vy` are set to zero.
- Pinned nodes keep their positions and velocities but **still consume a sequence index** (see **LAY-56**).
- Alpha is set to 1, the warm-up loop runs, and alpha is then set to `0.05`.
- `charge` is recomputed for every node, pinned or not.

What it does **not** reset: pins, the Focus set, selection, hover, the camera, the Budget, or anything in the Store.

### 2.4 The animation rule

**LAY-25.** Only the force engine MUST animate. Hierarchy, radial and grid MUST compute once and settle immediately, producing their final positions within the single relayout call `[src: stepLayout()]`.

**LAY-26.** The per-frame step MUST advance the simulation only when the resolved mode is `force` **and** the simulation is not frozen (**LAY-15**, line 2). For the other three modes the per-frame cost after relayout MUST be zero beyond the signature check.

**LAY-27.** The freeze control MUST be disabled whenever the resolved mode is not `force`, and its explanation MUST state the reason `[src: relayout()]`:

- resolved mode is `force`, running → *"Simulation running — click to freeze"*
- resolved mode is `force`, frozen → *"Simulation frozen — click to resume"*
- resolved mode is anything else → *"{Layout mode} is computed once, so there is nothing to freeze"*

**LAY-28.** A fresh force layout MUST settle **before first paint**. The warm-up loop of [§5.10](#510-the-warm-up-schedule-and-alpha) runs synchronously inside the relayout call, so the first frame drawn after a seed, a mode change or a manual re-layout shows a settled graph, not an expanding blob. This is a hard requirement: a graph that visibly explodes outward on every seed reads as broken regardless of where it ends up.

---

## 3. Parallel edge indexing

**LAY-29.** Before any engine runs, every edge MUST be assigned a multiplicity index and a multiplicity count over its unordered endpoint pair `[src: indexEdges()]`:

```
indexEdges():
  1. pairs ← empty map from pair key to list of edges
  2. for each edge e in the edge map:
  3.     k ← (e.a < e.b) ? e.a + "|" + e.b : e.b + "|" + e.a      // order-independent
  4.     append e to pairs[k]
  5. for each list L in pairs:
  6.     for i from 0 to |L| - 1:
  7.         L[i].mi ← i           // this edge's index within the bundle
  8.         L[i].mn ← |L|         // how many edges are in the bundle
```

**LAY-30.** The pair key MUST be **order-independent** (line 3) — the lexicographically smaller IRI first. Antiparallel edges (`a → b` and `b → a`) are visually parallel and MUST therefore share a bundle. Keying on the ordered pair would fan them onto the same curve and hide one behind the other.

**LAY-31.** The pair key separator `|` is acceptable here and only here, because the key's sole purpose is transient grouping within a single pass. It is **not** an edge identity; edge identity is the U+0001-separated triple key of [Graph viewport and Budget, §3.2](20-graph-viewport-and-budget.md#32-the-composite-key).

**LAY-32.** Indices MUST be assigned in the iteration order of the edge map, which is insertion order. Because admission order is deterministic ([Graph viewport and Budget, §5](20-graph-viewport-and-budget.md#5-admission)), the assignment is deterministic.

**LAY-33.** Indexing MUST cover **all** edges in the map, including any whose endpoints are not both resident. This is deliberate: indexing is cheap, and filtering here would make `mn` inconsistent with what the renderer sees if an endpoint were restored.

**LAY-34.** `mi` and `mn` are a **contract with the renderer** and carry no geometric meaning in this document. The renderer MUST use them to fan a bundle apart — typically by offsetting each edge's control point perpendicular to the chord by an amount derived from `mi` and `mn`, with the bundle symmetric about the chord. See [Rendering and export](22-graph-rendering-and-export.md#edge-routing).

**LAY-35.** For `mn = 1` the renderer MUST draw a straight chord. A bundle of one MUST NOT be displaced.

**LAY-36.** Complexity MUST be `O(|E|)` expected, with one hash insertion per edge.

### 3.1 Worked example

In Subgraph M ([§1.4](#14-worked-example-of-the-heuristic)) the pair `(pizza:Margherita, pizza:MozzarellaTopping)` carries exactly one edge, so `mi = 0`, `mn = 1` and it is drawn straight. Adding the inverse property view — where both `pizza:hasTopping —owl:inverseOf→ pizza:isToppingOf` and `pizza:isToppingOf —owl:inverseOf→ pizza:hasTopping` are resident — gives a bundle of two over the pair `(pizza:hasTopping, pizza:isToppingOf)`: the first gets `mi = 0, mn = 2`, the second `mi = 1, mn = 2`, and the renderer bows them symmetrically apart.

---

## 4. Centring

**LAY-37.** A shared centring primitive MUST exist and MUST translate a node set so that its bounding box is centred on the world origin, returning the offset it applied `[src: centreNodes()]`:

```
centreNodes(nodes) -> { dx, dy }:
  1. x0 ← +∞ ; y0 ← +∞ ; x1 ← -∞ ; y1 ← -∞
  2. for each n in nodes:
  3.     x0 ← min(x0, n.x) ; y0 ← min(y0, n.y)
  4.     x1 ← max(x1, n.x) ; y1 ← max(y1, n.y)
  5. if x0 is not finite: return { dx: 0, dy: 0 }        // empty set
  6. dx ← -(x0 + x1) / 2
  7. dy ← -(y0 + y1) / 2
  8. for each n in nodes: n.x ← n.x + dx ; n.y ← n.y + dy
  9. return { dx, dy }
```

**LAY-38.** The bounding box MUST be computed over node **centres**, not over node discs. Radii are not included. This is intentional and MUST be preserved: including radii would make the centre depend on which node happens to be the largest at each extreme, so two layouts with identical structure and different degrees would centre differently.

**LAY-39.** The empty-set guard (line 5) MUST return a zero offset rather than propagating infinities.

**LAY-40.** Centring MUST be applied by hierarchy, radial and grid as their final positioning step `[src: layoutHierarchy(), layoutRadial(), layoutGrid()]`. The force engine MUST NOT call it — its own centring force ([§5.6](#56-the-centring-force)) already holds the graph near the origin, and a hard recentre would fight the simulation every tick.

**LAY-41.** **Any layout that also positions decorations MUST shift those decorations by the same offset.** This is the obligation that makes the primitive safe to use. A layout that centres its nodes but not its group frames or its rings produces a picture where the furniture has slid off the data.

**LAY-42.** Concretely, in the reference:

- The cluster grid computes its group frames in pre-centring coordinates and then adds the returned offset to each frame's origin before publishing them `[src: layoutGrid()]`.
- The radial engine centres its nodes and then records the ring origin as the **post-centring position of the first root**, so the rings are drawn concentric with the root wherever the root ended up `[src: layoutRadial()]`. The source comment states the rule: *"rings are drawn in world space, so shift them with everything else."*

**LAY-43.** Decoration records published to the renderer MUST be in final world coordinates. The renderer MUST NOT be required to know that a centring pass happened.

---

## 5. Force-directed

This is the general-purpose engine, the default resolution of `auto`, and the only mode that animates. It is a Barnes–Hut n-body simulation with Hooke-law links, a weak centring force, velocity damping with a speed clamp, and a hard collision-resolution pass.

### 5.1 Overview and structure

**LAY-44.** One tick MUST perform these stages, in this order `[src: forceTick()]`:

```
forceTick(sync):
  1. guard: no nodes → return
  2. guard: not sync and alpha < 0.004 → return
  3. build the Barnes–Hut quadtree over all nodes           (§5.2)
  4. accumulate mass and centres of mass                     (§5.3)
  5. accumulate repulsion into every node's velocity          (§5.4)
  6. accumulate link forces into velocities                   (§5.5)
  7. accumulate the centring force into velocities            (§5.6)
  8. damp, clamp and integrate                                (§5.7)
  9. resolve collisions                                       (§5.8)
 10. decay alpha                                              (§5.10)
```

**LAY-45.** The `sync` flag distinguishes a warm-up tick (run inside a fresh layout, synchronously, in a loop) from an animation tick (run once per frame). It MUST affect exactly two things: the alpha floor guard at line 2, and the collision iteration count at line 9. Nothing else.

**LAY-46.** The alpha floor guard MUST be `alpha < 0.004` and MUST apply only to animation ticks `[src: forceTick()]`. Once alpha falls below the floor the simulation is visually static, and continuing to tick costs a full `O(n log n)` pass per frame for no visible change.

### 5.2 The Barnes–Hut quadtree

**LAY-47.** A quadtree cell MUST carry exactly these fields `[src: QNode()]`:

| Field | Meaning |
|---|---|
| `x0, y0, x1, y1` | cell bounds |
| `k` | array of four child cells, or null when the cell is a leaf |
| `b` | the single body in this leaf, or null |
| `extra` | a bucket of co-located bodies, or null |
| `mass` | accumulated charge of the subtree |
| `cx, cy` | charge-weighted centre of mass of the subtree |

**LAY-48.** `k` and `b` MUST be mutually exclusive by construction: a cell either holds one body or has children, never both `[src: qInsert()]`.

**LAY-49.** The root cell MUST be **square** and MUST enclose every node with a margin `[src: forceTick()]`:

```
  1. compute the bounding box (x0, y0, x1, y1) over node centres
  2. span ← max(2, x1 - x0, y1 - y0) + 8
  3. root ← QNode(x0 - 4, y0 - 4, x0 - 4 + span, y0 - 4 + span)
```

**LAY-50.** The root MUST be square because the opening-angle criterion of [§5.4](#54-repulsion-accumulation) tests cell **width** against distance. With rectangular cells the same criterion would be accurate along one axis and wrong along the other. The `max(2, ...)` floor keeps the span positive when every node is co-located; the `+8` and the `-4` offsets give a margin so that a node exactly on the bounding box does not land on a cell boundary.

**LAY-51.** Child cells MUST be created in this order and indexed by this rule `[src: qSplit(), qPut()]`:

```
qSplit(q):
  mx ← (q.x0 + q.x1) / 2 ; my ← (q.y0 + q.y1) / 2
  q.k ← [ QNode(q.x0, q.y0, mx,    my   ),      // index 0: north-west
          QNode(mx,    q.y0, q.x1, my   ),      // index 1: north-east
          QNode(q.x0, my,    mx,    q.y1),      // index 2: south-west
          QNode(mx,    my,    q.x1, q.y1) ]     // index 3: south-east

qPut(q, b, depth):
  mx ← (q.x0 + q.x1) / 2 ; my ← (q.y0 + q.y1) / 2
  index ← (b.x >= mx ? 1 : 0) + (b.y >= my ? 2 : 0)
  qInsert(q.k[index], b, depth + 1)
```

**LAY-52.** Insertion MUST be `[src: qInsert()]`:

```
qInsert(q, b, depth):
  1. if depth > 22 or (q.x1 - q.x0) < 0.5:
  2.     append b to q.extra (creating the bucket if absent)   // depth guard
  3.     return
  4. if q.k is null and q.b is null:
  5.     q.b ← b                                                // empty leaf
  6.     return
  7. if q.k is null:
  8.     old ← q.b ; q.b ← null
  9.     qSplit(q)
 10.     qPut(q, old, depth)                                    // re-home the old body
 11. qPut(q, b, depth)
```

**LAY-53.** The **depth guard** MUST be present and MUST use both conditions of line 1: a maximum depth of **22** and a minimum cell width of **0.5** world units. Without it, two bodies at identical or near-identical coordinates cause unbounded subdivision — each split puts both bodies in the same quadrant, forever. The guard converts that infinite recursion into a flat bucket.

**LAY-54.** The **co-located-body bucket** (`extra`) MUST be a list, MUST be allocated lazily, and MUST be handled everywhere `b` is handled: in mass accumulation ([§5.3](#53-mass-accumulation)), in repulsion ([§5.4](#54-repulsion-accumulation)), and in the leaf-self-exclusion test. A cell may hold a bucket while also having children — the guard fires on depth, and cells above the guard depth may already have split.

**LAY-55.** Tree construction MUST be `O(n log n)` expected for well-distributed points and `O(n × 22)` worst case, bounded by the depth guard.

### 5.3 Mass accumulation

**LAY-56.** Each node's charge MUST be recomputed at the start of each force layout `[src: layoutForce()]`:

```
n.charge = 210 + n.r * 16
```

With radii in `[5.5, 17.5]` (see [Graph viewport and Budget, §2.3](20-graph-viewport-and-budget.md#23-the-radius-function)), charge ranges over `[298, 490]`. Bigger nodes push harder, so hubs clear space for the neighbourhoods that hang off them, but the ratio is kept under 1.7 so that a hub does not blast small nodes off screen.

**LAY-57.** Non-finite coordinates MUST be sanitised to the origin at the same point `[src: layoutForce()]`:

```
if n.x is not finite or n.y is not finite: n.x ← 0 ; n.y ← 0
```

This is the only guard against a single NaN propagating through the whole simulation in one tick.

**LAY-58.** Mass and centre of mass MUST be accumulated bottom-up over the whole tree `[src: qAccumulate()]`:

```
qAccumulate(q):
  1. m ← 0 ; sx ← 0 ; sy ← 0
  2. if q.b:      m += q.b.charge ; sx += q.b.x * q.b.charge ; sy += q.b.y * q.b.charge
  3. if q.extra:  for each b: m += b.charge ; sx += b.x * b.charge ; sy += b.y * b.charge
  4. if q.k:      for each child c:
  5.                  qAccumulate(c)
  6.                  if c.mass > 0: m += c.mass ; sx += c.cx * c.mass ; sy += c.cy * c.mass
  7. q.mass ← m
  8. if m > 0: q.cx ← sx / m ; q.cy ← sy / m
```

**LAY-59.** A cell with zero mass MUST leave `cx` and `cy` at their initialised values and MUST be skipped entirely during repulsion (**LAY-61**, line 1). Dividing by zero mass is the other way a NaN enters the simulation.

**LAY-60.** Accumulation MUST be `O(number of cells)` = `O(n)`.

### 5.4 Repulsion accumulation

**LAY-61.** Repulsion MUST be accumulated per node by descending the tree with the opening-angle criterion `[src: qRepel()]`:

```
qRepel(q, n, alpha):
  1. if q.mass = 0: return
  2. dx ← n.x - q.cx ; dy ← n.y - q.cy
  3. d2 ← dx*dx + dy*dy
  4. w  ← q.x1 - q.x0                       // cell width; the cell is square
  5. if q.k is null or w*w < THETA2 * d2:   // leaf, or far enough to approximate
  6.     if q.k is null and q.b = n and q.extra is null: return    // self-exclusion
  7.     if d2 < 9: d2 ← 9                                          // minimum distance clamp
  8.     f ← q.mass * alpha / d2
  9.     n.vx ← n.vx + dx * f ; n.vy ← n.vy + dy * f
 10.     return
 11. for each child c of q.k: qRepel(c, n, alpha)
 12. if q.extra:
 13.     for each b in q.extra:
 14.         if b = n: continue                                     // self-exclusion
 15.         ex ← n.x - b.x ; ey ← n.y - b.y ; e2 ← ex*ex + ey*ey
 16.         if e2 < 9: e2 ← 9
 17.         f ← b.charge * alpha / e2
 18.         n.vx ← n.vx + ex * f ; n.vy ← n.vy + ey * f
```

**LAY-62.** The opening-angle constant MUST be stored and tested in **squared** form `[src: THETA2]`:

```
THETA2 = 0.66          // theta = sqrt(0.66) ≈ 0.8124
```

**LAY-63.** The criterion tested MUST be exactly `w * w < THETA2 * d2` (line 5), which is the squared form of `w / d < theta`. Testing the squared form MUST be preserved: it avoids a square root in the innermost loop of the whole product, and that square root would be executed tens of thousands of times per tick.

**LAY-64.** A cell MUST be approximated by its centre of mass when **either** it is a leaf **or** the criterion holds. Leaves are always exact (they hold at most one body plus a bucket), so the disjunction is not an approximation shortcut for leaves — it is the recursion's base case.

**LAY-65.** **Self-exclusion** MUST be handled in both places it can arise:

- Line 6: the node being repelled is the sole body of this leaf and the leaf has no bucket. Returning here is correct and necessary — the alternative is a force of the node upon itself, which after the distance clamp is a nonzero push in an arbitrary direction.
- Line 14: the node being repelled is in this cell's co-located bucket, handled by a direct pairwise skip.

**LAY-66.** The case where the node is a leaf's body **and** the leaf has a bucket MUST fall through to the approximate branch (line 6's third condition fails), accepting a small self-contribution, because the alternative — excluding the node's own charge from an already-accumulated centre of mass — cannot be done without recomputing the cell. This is the reference's behaviour and MUST be preserved for determinism.

**LAY-67.** The **minimum squared distance clamp** MUST be `d2 < 9 → d2 = 9` (lines 7 and 16), that is, a minimum separation of 3 world units. Two nodes that reach near-coincidence would otherwise produce a force approaching infinity and eject each other across the canvas in one tick. The clamp converts that singularity into a bounded maximum push.

**LAY-68.** The force applied (lines 8 and 9) multiplies the **displacement vector** by `mass × alpha / d2`. The resulting magnitude is therefore `mass × alpha × d / d2 = mass × alpha / d` — an inverse-**linear** law, not inverse-square. This MUST be preserved. Inverse-linear repulsion is the standard choice for graph drawing because inverse-square decays too fast to separate distant components, and the clamp at line 7 bounds the near field.

**LAY-69.** Repulsion is accumulated into **velocity**, not into a separate force accumulator. There is no mass term in the integration; this is a first-order (velocity-Verlet-free) relaxation scheme, and it MUST be preserved because the damping constant of [§5.7](#57-damping-clamping-and-integration) is tuned against it.

**LAY-70.** Repulsion MUST cost `O(n log n)` per tick: each of `n` nodes descends the tree, visiting `O(log n)` cells under the opening-angle criterion.

### 5.5 The link force

**LAY-71.** Link forces MUST be accumulated over `viewEdges()` — both endpoints resident — as follows `[src: forceTick()]`:

```
for each edge e in viewEdges():
  1. a ← nodes[e.a] ; b ← nodes[e.b]
  2. dx ← b.x - a.x + 1e-6 ; dy ← b.y - a.y + 1e-6     // epsilon breaks exact coincidence
  3. d  ← hypot(dx, dy) or 1 when zero
  4. target ← 48 + a.r + b.r + (e.pred in HIER_PREDS ? 0 : 26)
  5. stiff  ← 0.6 / min(7, max(1, min(a.shownDeg, b.shownDeg)))
  6. f  ← (d - target) / d * alpha * stiff
  7. fx ← dx * f ; fy ← dy * f
  8. bias ← b.shownDeg / max(1, a.shownDeg + b.shownDeg)
  9. a.vx += fx * bias        ; a.vy += fy * bias
 10. b.vx -= fx * (1 - bias)  ; b.vy -= fy * (1 - bias)
```

#### The per-predicate rest length

**LAY-72.** The rest length MUST be `48 + a.r + b.r`, plus **26** when the predicate is **not** in the hierarchy predicate set (line 4).

| Edge kind | Rest length |
|---|---|
| `rdfs:subClassOf`, `rdfs:subPropertyOf`, `rdf:type` | `48 + a.r + b.r` |
| every other predicate | `74 + a.r + b.r` |

**LAY-73.** Adding both radii MUST be preserved: the rest length is a *gap* between disc edges, not between centres, so two hubs do not overlap at rest and two small nodes are not pushed absurdly far apart.

**LAY-74.** Structural edges MUST sit tighter than incidental ones. The source states the intent: *"structural edges sit tighter than incidental ones, so the skeleton reads"* `[src: forceTick()]`. The effect is that the taxonomy pulls into a compact core while restrictions, domains, ranges and inverses hang off it at a visibly greater distance — so the reader can tell the spine from the decoration without reading a single label.

#### Degree-based stiffness

**LAY-75.** Stiffness MUST be `0.6 / min(7, max(1, min(a.shownDeg, b.shownDeg)))` (line 5). Worked values:

| `min(shownDeg)` | Stiffness |
|---|---|
| 0 or 1 | 0.600 |
| 2 | 0.300 |
| 3 | 0.200 |
| 4 | 0.150 |
| 5 | 0.120 |
| 6 | 0.100 |
| 7 or more | 0.086 |

**LAY-76.** Stiffness MUST use the **lesser** of the two in-view degrees. An edge between a leaf and a hub is governed by the leaf, so leaves are pulled firmly onto their parent while hub-to-hub edges stay slack and let the large-scale structure breathe.

**LAY-77.** The clamp at 7 MUST be preserved. Without it a node of in-view degree 500 would have near-zero stiffness on every incident edge and would detach from its own neighbourhood.

**LAY-78.** The `max(1, ...)` floor MUST be preserved: a node whose in-view degree is 0 cannot occur on an edge, but the floor prevents a division by zero if the bookkeeping invariant of [Graph viewport and Budget, §3.3](20-graph-viewport-and-budget.md#33-linking-a-node-into-the-view) is ever violated.

#### The degree bias

**LAY-79.** The force MUST be split between the two endpoints by the bias of line 8, which gives each endpoint a share **proportional to the other endpoint's in-view degree**:

```
a receives  bias      = b.shownDeg / (a.shownDeg + b.shownDeg)
b receives  1 - bias  = a.shownDeg / (a.shownDeg + b.shownDeg)
```

**LAY-80.** The consequence MUST be understood and preserved: **hubs stay still, leaves move**. Consider a leaf `a` with `shownDeg = 1` joined to a hub `b` with `shownDeg = 50`. Then `bias = 50/51 ≈ 0.98`: the leaf takes 98 per cent of the correction and the hub takes 2 per cent. Without the bias, a hub with fifty incident edges would receive fifty corrections per tick and jitter violently while its leaves sat still — exactly backwards, since the hub is the landmark the reader navigates by.

**LAY-81.** The two shares MUST sum to 1 and MUST be applied with opposite signs (lines 9 and 10), so the link force conserves the pair's centroid and cannot translate the graph.

**LAY-82.** The epsilon at line 2 (`+ 1e-6` on both components) MUST be preserved: it guarantees a non-degenerate direction for two exactly coincident endpoints, which the fallback `d = 1` at line 3 alone would not.

**LAY-83.** Link accumulation MUST be `O(|E|)` per tick.

### 5.6 The centring force

**LAY-84.** A weak centring force MUST pull every node toward the world origin, proportionally to its displacement `[src: forceTick()]`:

```
for each node n:
  n.vx ← n.vx - n.x * 0.024 * alpha
  n.vy ← n.vy - n.y * 0.024 * alpha
```

**LAY-85.** The coefficient MUST be **0.024** and MUST be scaled by alpha, so the centring relaxes as the layout settles.

**LAY-86.** The centring force MUST apply to every node, including nodes in disconnected components. It is the only thing preventing a component with no links from being pushed to infinity by repulsion alone. The source states this: *"weak centring keeps disconnected components from drifting to infinity"* `[src: forceTick()]`.

**LAY-87.** The centring force MUST be weak relative to repulsion and links. At `alpha = 1` a node 500 world units from the origin receives a centring velocity of 12 units per tick — enough to prevent escape, far too little to collapse structure.

**LAY-88.** The force engine MUST NOT additionally call the hard centring primitive of [§4](#4-centring). See **LAY-40**.

### 5.7 Damping, clamping and integration

**LAY-89.** Integration MUST be `[src: forceTick()]`:

```
for each node n:
  1. if n.pinned or n.dragging:
  2.     n.vx ← 0 ; n.vy ← 0
  3.     continue                                   // position untouched
  4. n.vx ← n.vx * 0.62 ; n.vy ← n.vy * 0.62       // damping
  5. sp ← hypot(n.vx, n.vy)
  6. if sp > 45:                                    // speed clamp
  7.     n.vx ← n.vx / sp * 45 ; n.vy ← n.vy / sp * 45
  8. n.x ← n.x + n.vx ; n.y ← n.y + n.vy           // integrate
```

**LAY-90.** The damping factor MUST be **0.62** — that is, 38 per cent of velocity is discarded each tick. This is aggressive damping, and it is what makes the simulation settle in a few hundred ticks rather than a few thousand. Combined with the alpha schedule it gives a critically damped feel with no visible oscillation.

**LAY-91.** The speed clamp MUST be **45** world units per tick, applied to the velocity *magnitude* with the direction preserved (lines 5 to 7). The clamp is the last line of defence against a large impulse — a node admitted on top of a hub, a collapsed cluster suddenly released — throwing a node across the canvas in a single frame.

**LAY-92.** Pinned and dragged nodes MUST have velocity zeroed **and** position left untouched (lines 1 to 3). Zeroing without skipping integration is not sufficient, because the accumulated velocity from the current tick would already have been applied. See [Graph viewport and Budget, §12.4](20-graph-viewport-and-budget.md#124-node-drag).

**LAY-93.** Damping MUST be applied before the clamp, and the clamp before integration. The order matters: damping first means the clamp sees the velocity that will actually be applied.

### 5.8 Collision resolution

The source calls this *"the single biggest legibility win"* `[src: resolveCollisions()]`, and that claim MUST be taken seriously: the difference between a force graph with and without hard collision resolution is the difference between a readable diagram and a smear.

**LAY-94.** Collision resolution MUST be implemented as a spatial-hash relaxation `[src: resolveCollisions()]`:

```
resolveCollisions(iters):
  1. nodes ← all viewport nodes
  2. cell  ← 56
  3. for it from 1 to iters:
  4.     grid ← empty map from "gx,gy" to list of nodes
  5.     for each n in nodes:
  6.         key ← floor(n.x / cell) + "," + floor(n.y / cell)
  7.         append n to grid[key]
  8.     for each n in nodes:
  9.         gx ← floor(n.x / cell) ; gy ← floor(n.y / cell)
 10.         for dx in {-1, 0, 1}, for dy in {-1, 0, 1}:
 11.             c ← grid[(gx+dx) + "," + (gy+dy)]
 12.             if c is absent: continue
 13.             for each m in c:
 14.                 if m = n or m.iri <= n.iri: continue     // each pair once, IRI-ordered
 15.                 ddx ← m.x - n.x ; ddy ← m.y - n.y
 16.                 d   ← hypot(ddx, ddy)
 17.                 if d < 0.01:                              // exact coincidence
 18.                     ddx ← 0.7 ; ddy ← 0.3 ; d ← 0.76      // deterministic jitter
 19.                 min ← n.r + m.r + 11                      // separation margin
 20.                 if d >= min: continue
 21.                 push ← (min - d) / d * 0.5                // relaxation factor
 22.                 px ← ddx * push ; py ← ddy * push
 23.                 if not n.pinned and not n.dragging: n.x -= px ; n.y -= py
 24.                 if not m.pinned and not m.dragging: m.x += px ; m.y += py
```

#### Constants

| Constant | Value | Role |
|---|---|---|
| Cell size | `56` world units | Spatial hash bucket edge |
| Separation margin | `11` world units | Added to the sum of radii to get the minimum centre distance |
| Relaxation factor | `0.5` | Share of the overlap each node moves |
| Coincidence threshold | `0.01` | Below this distance the deterministic jitter fires |
| Jitter vector | `(0.7, 0.3)`, `d = 0.76` | Fixed direction and magnitude, chosen so `hypot(0.7, 0.3) ≈ 0.7616` |
| Iterations | `1` on a warm-up tick, `2` on an animation tick | see **LAY-45** |
| Iterations, radial post-pass | `3` | see [§7](#7-radial-tree) |

**LAY-95.** The cell size MUST be **56**, which exceeds twice the maximum possible node radius plus the margin (`2 × 17.5 + 11 = 46`). This guarantees that any colliding pair falls within the 3×3 neighbourhood scanned at line 10, so no overlap can be missed.

**LAY-96.** The grid MUST be rebuilt at the start of every iteration (line 4), because positions change within an iteration. Reusing a stale grid across iterations lets nodes escape their buckets and reintroduces the overlaps the second iteration was meant to fix.

**LAY-97.** Each unordered pair MUST be visited exactly once, and the ordering MUST be by **IRI** (line 14), not by array index or iteration order. IRI ordering is stable across runs and independent of admission order, which is what makes the pass deterministic.

**LAY-98.** The separation margin MUST be **11** world units of clear space between disc edges. This is not decoration: it is the space the renderer needs for node outlines and the minimum gap at which two adjacent discs read as two objects rather than one blob.

**LAY-99.** The relaxation factor MUST be **0.5**, applied to *each* node of the pair. Because both nodes move, an isolated overlapping pair is separated by exactly `(min - d)` in one visit — full resolution, not half. The factor is 0.5 per node precisely so that the pair's centroid is preserved.

**LAY-100.** When only one node of the pair can move — the other is pinned or dragged — the pair MUST end up separated by only half the overlap in that visit (lines 23 and 24). This MUST be preserved rather than "fixed" by doubling the push for the movable node: doubling makes a node adjacent to a pin jump, and the second iteration resolves the remainder anyway.

**LAY-101.** The coincidence jitter (lines 17 and 18) MUST use the fixed vector `(0.7, 0.3)`, never a random one. Two nodes at identical coordinates have no defined separation direction, and a random choice would break determinism ([§9](#9-determinism)). The asymmetric components ensure the pair separates diagonally rather than along an axis, which reads better when several nodes are co-located.

**LAY-102.** Collision resolution MUST move **positions**, never velocities. It is a geometric constraint projection, not a force. Feeding it into velocity would make it oscillate.

**LAY-103.** The pass MUST be `O(n)` expected: each node hashes into one bucket and scans nine buckets, whose occupancy is bounded in practice by the separation constraint the pass itself enforces.

### 5.9 The deterministic pre-seed

**LAY-104.** A fresh force layout MUST re-seed every non-pinned node by phyllotaxis before running the warm-up `[src: layoutForce()]`:

```
  1. i ← 0
  2. for each node n, in node-map iteration order:
  3.     if n.pinned: i ← i + 1 ; continue        // pinned nodes consume an index
  4.     a   ← i * 2.399963229728653              // golden angle, radians
  5.     rad ← 30 * sqrt(i + 0.5)
  6.     n.x ← cos(a) * rad ; n.y ← sin(a) * rad
  7.     n.vx ← 0 ; n.vy ← 0
  8.     i ← i + 1
```

| Constant | Value |
|---|---|
| Golden angle | `2.399963229728653` rad — π(3 − √5), about 137.5077° |
| Radius coefficient | `30` world units |
| Radius offset | `0.5` |

**LAY-105.** The angle MUST advance by the golden angle per index. This is the Vogel spiral, and it is the unique constant for which no two indices ever align on a ray, giving a near-uniform disc with no visible spokes or rings.

**LAY-106.** The radius MUST grow as `30 × √(i + 0.5)`. The square root is what makes the *area* per node constant: node `i` sits at radius proportional to `√i`, so the disc's area grows linearly with the count and density is uniform. The `+0.5` offset keeps index 0 off the exact origin, which matters because a node at exactly `(0, 0)` receives no centring force and can sit in a local minimum.

**LAY-107.** Pinned nodes MUST keep their positions but MUST still **consume a sequence index** (line 3). This MUST be preserved: skipping the increment would change every subsequent node's seed position depending on how many nodes happen to be pinned, so pinning one node would relocate the entire rest of the graph.

**LAY-108.** Iteration order MUST be the node map's insertion order, which is admission order and therefore deterministic.

**LAY-109.** This is the same spiral used for per-node initial placement ([Graph viewport and Budget, §4](20-graph-viewport-and-budget.md#4-initial-placement)) with different constants — coefficient 30 rather than 34, offset `+0.5` rather than `mod 240 + 1`, and no seed origin. The difference MUST be preserved: initial placement spreads a *batch* around a seed node and recycles its radius so a long exploration does not fling new nodes ever further out; the pre-seed lays out the *whole graph* from the origin and must therefore grow without recycling.

### 5.10 The warm-up schedule and alpha

**LAY-110.** Alpha MUST decay multiplicatively at the end of every tick `[src: forceTick()]`:

```
alpha ← alpha - alpha * 0.0228          // equivalently alpha ← alpha * 0.9772
```

**LAY-111.** The decay constant MUST be **0.0228**. From `alpha = 1`, reaching the animation floor of `0.004` takes `ln(0.004) / ln(0.9772) ≈ 239` ticks — about four seconds at 60 frames per second, which is the target settling time for an interactive reheat.

**LAY-112.** Alpha wake levels MUST be as follows, and each MUST use a maximum rather than an assignment so a bigger pending disturbance is never reduced by a smaller one:

| Event | Level | Source |
|---|---|---|
| Node admission | `max(alpha, 0.9)` | `[src: addToView()]` |
| Node removal | `max(alpha, 0.4)` | `[src: removeFromView()]` |
| Node drag frame | `max(alpha, 0.35)` | `[src: wireCanvas()]` |
| Freeze control resume | `= 0.6` (assignment) | `[src: gLayout]` |
| Incremental force relayout | `max(alpha, 0.5)` | `[src: layoutForce()]` |
| Fresh force layout, before warm-up | `= 1` | `[src: layoutForce()]` |
| Fresh force layout, after warm-up | `= 0.05` | `[src: layoutForce()]` |

**LAY-113.** A fresh layout MUST run a synchronous warm-up loop whose tick count is `[src: layoutForce()]`:

```
ticks = clamp( round(70000 / (nodeCount + 60)), 70, 300 )
```

| Node count | `70000 / (n + 60)` | Ticks after clamping |
|---|---|---|
| 10 | 1000.0 | 300 |
| 50 | 636.4 | 300 |
| 173 | 300.4 | 300 |
| 200 | 269.2 | 269 |
| 400 | 152.2 | 152 |
| 600 | 106.1 | 106 |
| 940 | 70.0 | 70 |
| 1,000 | 66.0 | 70 |
| 3,000 | 22.9 | 70 |

**LAY-114.** The clamps MUST be **70** minimum and **300** maximum. The formula trades ticks for nodes so that total warm-up work stays roughly constant — `ticks × n` is about 70,000 node-ticks in the unclamped region — while the floor guarantees even a 3,000-node view gets enough iterations to be more than a phyllotaxis spiral, and the ceiling stops a five-node view spending three hundred ticks converging on an answer it reached in forty.

**LAY-115.** Warm-up ticks MUST be run with `sync = true`, which bypasses the alpha floor guard and uses one collision iteration instead of two (**LAY-45**).

**LAY-116.** After the warm-up, alpha MUST be set to **0.05** — not to zero. A small residual keeps the graph very slightly alive, so that a subsequent admission's wake to 0.9 is a continuation rather than a restart, and so that any residual collision overlap continues to relax.

**LAY-117.** A fresh layout MUST settle before first paint (**LAY-28**). The warm-up loop MUST therefore be synchronous within the relayout call in a single-threaded implementation, or MUST block the first paint of the new layout in a threaded one. See [Appendix A](#appendix-a--native-stack-mapping-non-normative).

### 5.11 Complexity

**LAY-118.** One force tick MUST be `O(n log n + m)` where `n` is the node count and `m` the edge count, decomposed as:

| Stage | Cost | Justification |
|---|---|---|
| Bounding box | `O(n)` | one pass |
| Quadtree build | `O(n log n)` expected | each of `n` insertions descends `O(log n)` levels for well-distributed points; bounded by the depth-22 guard in the worst case, giving `O(22n)` |
| Mass accumulation | `O(n)` | the tree has `O(n)` cells |
| Repulsion | `O(n log n)` | each node descends the tree, and the opening-angle criterion terminates the descent after `O(log n)` cells for `theta ≈ 0.81`; this is the standard Barnes–Hut bound |
| Links | `O(m)` | one pass |
| Centring | `O(n)` | one pass |
| Integration | `O(n)` | one pass |
| Collisions | `O(n)` expected per iteration, 1 or 2 iterations | spatial hash with bounded occupancy |

Since an ontology view has `m = O(n)` in practice (average degree under 10 after the Budget bounds the view), the tick is `O(n log n)`.

**LAY-119.** A fresh layout MUST therefore be `O(ticks × n log n)`, which by **LAY-114** is bounded at roughly `70,000 × log n` node-ticks in the unclamped region and `70 n log n` above 940 nodes.

**LAY-120.** The per-tick budget at 1,000 nodes MUST be **≤ 6.0 ms** (see [Graph viewport and Budget, §14.1](20-graph-viewport-and-budget.md#141-per-frame)), and a fresh layout at 1,000 nodes MUST complete in **≤ 400 ms**.

### 5.12 Force-directed: when to use, what it guarantees, what it does not

**When to use.** A mixed view with no dominant structure: some taxonomy, some restrictions, some instances, two or more focal points. The resolution of last resort in `auto`, and the correct explicit choice when the user wants to see *connectivity* rather than *hierarchy* or *grouping*.

**What it guarantees.**
- No two nodes overlap after the collision pass, with at least 11 world units of clear space between disc edges (**LAY-98**).
- Structurally related nodes sit measurably closer than incidentally related ones (**LAY-72**).
- Disconnected components stay on the canvas (**LAY-86**).
- Deterministic output for identical input (**LAY-104**, [§9](#9-determinism)).
- No node moves more than 45 world units in one tick (**LAY-91**).
- A fresh layout is settled before it is first drawn (**LAY-28**).

**What it does not guarantee.**
- **No global optimum.** It finds a local minimum. Two different admission orders over the same final node set produce two different — both valid — drawings, because the pre-seed indices differ.
- **No edge-crossing bound.** It does not minimise crossings and makes no attempt to.
- **No stable position under change.** Adding one node reheats the simulation and every node may move. There is no "add without disturbing" mode.
- **No readable hierarchy.** Subclass depth is not mapped to any axis. A taxonomy drawn with force is connected correctly and readable only with effort — which is exactly why `auto` prefers hierarchy when the view is taxonomic (**LAY-7**, line 10).
- **No bound on aspect ratio.** A long chain draws long.

### 5.13 Worked example — Subgraph M

Take Subgraph M from [§1.4](#14-worked-example-of-the-heuristic): five nodes, four edges, `auto` resolving to force. Assume the in-view degrees that linking produces:

| Node | Kind | `shownDeg` | `r` (given `deg` in brackets) |
|---|---|---|---|
| `pizza:Margherita` | class | 4 | 12.99 (`deg` 6) |
| `pizza:NamedPizza` | class | 1 | 15.84 (`deg` 23) |
| `pizza:MozzarellaTopping` | class | 1 | 14.13 (`deg` 12) |
| `pizza:TomatoTopping` | class | 1 | 14.13 (`deg` 12) |
| `pizza:Italy` | individual | 1 | 8.70 (`deg` 3) |

Radii follow `base + min(9, log2(1 + deg) × 1.6)` — for example `pizza:NamedPizza`: `8.5 + log2(24) × 1.6 = 8.5 + 4.585 × 1.6 = 15.84`.

**Charges** (**LAY-56**): Margherita `210 + 12.99 × 16 = 417.8`; NamedPizza `462.4`; the toppings `436.1` each; Italy `349.2`.

**Rest lengths** (**LAY-72**):

| Edge | In `HIER_PREDS`? | Rest length |
|---|---|---|
| Margherita → NamedPizza (`rdfs:subClassOf`) | yes | `48 + 12.99 + 15.84 = 76.8` |
| Margherita → MozzarellaTopping (`pizza:hasTopping`) | no | `48 + 12.99 + 14.13 + 26 = 101.1` |
| Margherita → TomatoTopping (`pizza:hasTopping`) | no | `101.1` |
| Margherita → Italy (`pizza:hasCountryOfOrigin`) | no | `48 + 12.99 + 8.70 + 26 = 95.7` |

The parent sits about 24 world units closer than the toppings do, so the taxonomic edge reads as the spine even before the reader looks at a label.

**Stiffness** (**LAY-75**): every edge has `min(shownDeg) = 1`, so every edge is at maximum stiffness `0.6`. This is a leaf-dominated view and all four links pull hard.

**Bias** (**LAY-79**): for Margherita → NamedPizza, `bias = 1 / (4 + 1) = 0.2`. Margherita, the higher-degree endpoint, takes 20 per cent of the correction and NamedPizza takes 80 per cent. The hub with four edges receives four corrections per tick, each scaled to a fifth — so its net motion is comparable to a leaf's, rather than four times larger.

**Pre-seed** (**LAY-104**) in admission order — Margherita seeded first:

| `i` | Node | `a` (rad) | `rad` | `x` | `y` |
|---|---|---|---|---|---|
| 0 | Margherita | 0.000 | 21.21 | 21.21 | 0.00 |
| 1 | NamedPizza | 2.400 | 36.74 | −27.13 | 24.76 |
| 2 | MozzarellaTopping | 4.800 | 47.43 | 4.13 | −47.25 |
| 3 | TomatoTopping | 7.200 | 55.90 | 34.53 | 43.94 |
| 4 | Italy | 9.600 | 63.64 | −60.13 | −20.83 |

**Warm-up** (**LAY-113**): `70000 / (5 + 60) = 1076.9`, clamped to **300** ticks. Alpha runs `1 → 1 × 0.9772^300 ≈ 0.001`, then is set to `0.05`. The layout is fully settled before the first frame is drawn.

**Settled shape.** Margherita sits near the centroid, held there by four links and the centring force; the parent sits about 77 units away; the two toppings and the country sit about 96 to 101 units away, pushed apart from each other by repulsion and separated by at least `12.99 + 14.13 + 11 = 38` units of centre distance by the collision pass. No node overlaps any other.

---

## 6. Hierarchy (Sugiyama)

A layered drawing of the taxonomy: layers by longest path, orders by median heuristic, coordinates by priority relaxation. Computed once; no animation.

### 6.1 The hierarchy relation

**LAY-121.** The hierarchy predicate set MUST be exactly `{ rdfs:subClassOf, rdfs:subPropertyOf, rdf:type }` `[src: HIER_PREDS]`.

**LAY-122.** The **child → parent** direction convention MUST be: for a hierarchy edge, `e.a` is the child, the subproperty or the instance, and `e.b` is the parent, the superproperty or the class `[src: layoutHierarchy()]`. The source states it at the point of use: *"edge.a is the child or the instance."* This follows directly from the edge construction rule in [Graph viewport and Budget, §3.3](20-graph-viewport-and-budget.md#33-linking-a-node-into-the-view), where `rdfs:subClassOf` is emitted in the `out` direction from the subclass.

**LAY-123.** Three adjacency maps MUST be built over the resident nodes `[src: layoutHierarchy()]`:

```
for each node n: kids[n.iri] ← [] ; pars[n.iri] ← [] ; nbr[n.iri] ← []
for each edge e in viewEdges():
    nbr[e.a].append(e.b) ; nbr[e.b].append(e.a)       // ALL edges, undirected
    if e.pred not in HIER_PREDS: continue
    pars[e.a].append(e.b)                              // a's parent is b
    kids[e.b].append(e.a)                              // b's child is a
```

**LAY-124.** The `nbr` map MUST include **every** edge, hierarchy or not (line 3), because it is used by the fallback rule of **LAY-129**. The `pars` and `kids` maps MUST include hierarchy edges only.

**LAY-125.** Including `rdf:type` in the hierarchy set means a class's Individuals layer directly beneath it, which is the correct reading: instance-of is a descent in the same sense subclass-of is.

### 6.2 Layer assignment

**LAY-126.** Layers MUST be assigned by **longest path from the roots**, with a cycle guard `[src: layoutHierarchy()]`:

```
layer ← empty map ; mark ← empty map

depthOf(u):
  1. if layer contains u: return layer[u]           // memoised
  2. if mark[u] = 1: return 0                       // CYCLE GUARD: u is on the stack
  3. mark[u] ← 1
  4. d ← 0
  5. for each p in pars[u]: d ← max(d, depthOf(p) + 1)
  6. layer[u] ← d
  7. return d

for each node n: depthOf(n.iri)
```

**LAY-127.** Longest path MUST be used, not shortest. A class reachable from the root by both a two-hop and a five-hop chain MUST sit at layer 5, so that every hierarchy edge points strictly downward and no edge is drawn backwards. Shortest-path layering produces upward edges wherever the taxonomy has a shortcut, and upward edges in a layered drawing destroy its whole reason for existing.

**LAY-128.** The cycle guard (line 2) MUST return `0` for a node currently on the recursion stack. It costs one map lookup and it is the difference between a robust layout and a stack overflow on any ontology containing a subclass cycle — which is malformed but perfectly possible, and which the product MUST survive. The node that closes the cycle is treated as a root for the purpose of that path.

**LAY-129.** Nodes with **no hierarchy edge at all** MUST be placed one layer below their deepest non-hierarchy neighbour `[src: layoutHierarchy()]`:

```
for each node n:
  1. if pars[n.iri] is non-empty or kids[n.iri] is non-empty: continue
  2. best ← -1
  3. for each v in nbr[n.iri]: best ← max(best, layer[v])
  4. if best >= 0: layer[n.iri] ← best + 1
```

**LAY-130.** The fallback MUST be applied only to nodes with **neither** parents nor children in the hierarchy (line 1). A node with children but no parents is a legitimate root and MUST stay at layer 0.

**LAY-131.** The fallback MUST leave a node with no neighbours at all at layer 0 (line 4's guard). Such a node joins the root row rather than vanishing or landing at a negative layer.

**LAY-132.** The fallback MUST run as a separate pass after all longest-path layers are assigned, and MUST read the already-assigned layers. It MUST NOT feed back into `depthOf`. Property nodes such as `pizza:hasTopping` — which have `rdfs:domain` and `rdfs:range` edges but no subclass edge — land one row under the class they constrain, which is exactly where a reader looks for them.

**LAY-133.** Rows MUST then be materialised as an array indexed by layer, with every node appended to its layer's row.

### 6.3 Initial ordering

**LAY-134.** Within-row order MUST be initialised by a depth-first traversal from the roots, so that siblings and subtrees start adjacent `[src: layoutHierarchy()]`:

```
  1. seen ← empty set ; order ← empty list ; stack ← empty list
  2. for each node n:        push n.iri onto stack      // every node, so none is missed
  3. for each n in rows[0]:  push n.iri onto stack      // roots on top, so they pop first
  4. while stack is non-empty:
  5.     u ← pop(stack)
  6.     if u in seen: continue
  7.     seen.add(u) ; order.append(u)
  8.     ks ← kids[u] sorted DESCENDING by localName
  9.     for each c in ks: if c not in seen: push c onto stack
 10. ord ← map from iri to its index in order
 11. for each row r: sort r ascending by ord[n.iri], treating a missing index as 0
```

**LAY-135.** Every node MUST be pushed first (line 2) and the roots pushed on top of them (line 3). The stack is last-in-first-out, so roots pop first and their subtrees are traversed before any orphan is reached; the earlier bulk push guarantees that nodes unreachable from any root still receive an order index.

**LAY-136.** Children MUST be sorted **descending** by local name before pushing (line 8), so that they **pop** in ascending order. Alphabetical sibling order is both stable and useful to a reader scanning for a name.

**LAY-137.** The sort key MUST be the local name, not the full IRI and not the display label. Local name gives the same order regardless of namespace prefix length and regardless of whether a label has been edited.

### 6.4 Crossing reduction

**LAY-138.** Edge crossings MUST be reduced by the median heuristic, alternating sweep direction `[src: layoutHierarchy()]`:

```
  1. pos ← map from iri to its index within its row
  2. reindex(): for each row r: for i, n in r: pos[n.iri] ← i
  3. reindex()
  4. median(u, up):
  5.     src ← up ? pars[u] : kids[u]
  6.     ps  ← [ pos[v] for v in src where pos[v] is defined ]
  7.     if ps is empty: return -1                      // "no opinion"
  8.     sort ps ascending
  9.     m ← floor(|ps| / 2)
 10.     return |ps| odd ? ps[m] : (ps[m-1] + ps[m]) / 2
 11. wide ← any row has more than 260 nodes
 12. if not wide:
 13.     for pass from 0 to 7:                          // 8 passes
 14.         up  ← (pass is even)
 15.         seq ← up ? rows : reverse(rows)
 16.         for each row r in seq:
 17.             key ← map ; for i, n in r: m ← median(n.iri, up)
 18.                                        key[n.iri] ← (m < 0 ? i : m)
 19.             sort r by key ascending, tie-broken by the CURRENT pos ascending
 20.             reindex()
```

**LAY-139.** A position index mapping each IRI to its current index within its row MUST be maintained (lines 1 to 3), and MUST be the only source of position information the median function reads. Recomputing a node's index by searching its row inside the median function would turn an `O(|r| log |r|)` sweep into an `O(|r|² )` one, and at the 260-node bail-out threshold that is the difference between microseconds and milliseconds.

**LAY-140.** The sweep count MUST be **8**, and the direction MUST alternate — even passes look **up** at parents, odd passes look **down** at children (lines 13 and 14). Alternation is essential: ordering a row only by its parents leaves its children unconsidered, and a one-directional sweep converges to a layout that is good above and poor below.

**LAY-141.** The reverse pass MUST iterate the rows in reverse order (line 15), so information propagates in the same direction the medians are read from.

**LAY-142.** A node with no neighbours in the reference direction MUST return `-1` from the median and MUST then keep its **current index** as its key (line 18). This MUST be preserved: substituting 0 would sweep every opinionless node to the left edge of its row on every pass, which both looks wrong and destroys the alphabetical ordering established in [§6.3](#63-initial-ordering).

**LAY-143.** The even-length median MUST be the **mean of the two central values** (line 10), not the lower or upper one. The mean is the standard median heuristic and is symmetric under reflection, which the lower-median variant is not.

**LAY-144.** Ties MUST be broken by the **current** position (line 19), making the sort stable with respect to the previous pass. Without a stable tie-break, nodes with equal medians — extremely common, since every child of the same parent has the same median — would permute arbitrarily on every pass and the sweep would not converge.

**LAY-145.** Positions MUST be re-indexed after every row is sorted (line 20), not once per pass. Medians must be computed against current positions or the heuristic degrades badly.

**LAY-146.** The **wide-layer bail-out** MUST skip crossing reduction entirely when any row holds more than **260** nodes (lines 11 and 12). The justification is twofold: the cost is `8 × sum over rows of |r| log |r|` plus a re-index per row, which becomes noticeable when a single row is in the hundreds; and more importantly, a row of 260-plus nodes is wider than any screen, so reducing its crossings changes a picture nobody can read into a different picture nobody can read. The bail-out MUST be silent — it is a performance guard, not a user-facing failure.

**LAY-147.** Crossing reduction is a heuristic and MUST NOT be presented as optimal. Minimising crossings in a layered drawing is NP-hard; the median heuristic typically achieves within a small factor of optimal on taxonomies.

### 6.5 Coordinate assignment

**LAY-148.** Node width MUST be `[src: layoutHierarchy()]`:

```
widthOf(n) = min(200, max(2 * n.r + 18, |n.label| * 6.8 + 16))
```

| Term | Meaning |
|---|---|
| `2 × r + 18` | the disc plus 9 units of clear space each side — the floor |
| `|label| × 6.8 + 16` | an estimate of rendered label width at the standard graph type size, plus padding |
| `min(200, ...)` | the ceiling; a very long label does not get a very wide slot |

**LAY-149.** Width MUST be estimated from character count, not measured. Measuring text during layout couples the layout to the renderer and to font loading, and the layout MUST be computable without a drawing surface (**LAY-172**). The coefficient `6.8` is the average advance width of the graph label face at its standard size; an implementation using a different face MUST re-derive it and MUST document the value.

**LAY-150.** Layer separation MUST be `gapY = 124` world units and within-row separation `gapX = 20` world units `[src: layoutHierarchy()]`.

**LAY-151.** Initial packing MUST lay each row out left to right, then centre the row on zero `[src: layoutHierarchy()]`:

```
for each row r:
  1. x ← 0
  2. for each n in r:
  3.     n._w ← widthOf(n)
  4.     n.x  ← x + n._w / 2
  5.     x    ← x + n._w + gapX
  6. total ← max(0, x - gapX)                 // drop the trailing gap
  7. for each n in r: n.x ← n.x - total / 2   // centre the row on 0
```

**LAY-152.** Priority relaxation MUST then pull nodes toward their neighbours' mean position, under hard left/right separation constraints `[src: layoutHierarchy()]`:

```
for pass from 0 to 11:                                  // 12 passes
  1. src ← (pass is even) ? pars : kids                 // alternate reference direction
  2. for each row r:
  3.     prio ← entries (n, i) of r sorted DESCENDING by n.shownDeg
  4.     for each (n, i) in prio:
  5.         refs ← [ m.x for v in src[n.iri] where m = nodes[v] exists ]
  6.         if refs is empty: continue
  7.         want ← mean(refs)
  8.         left  ← r[i-1] ; right ← r[i+1]
  9.         lo ← left  ? left.x  + left._w/2  + gapX + n._w/2 : -∞
 10.         hi ← right ? right.x - right._w/2 - gapX - n._w/2 : +∞
 11.         if lo > hi: continue                         // no feasible position
 12.         want ← clamp(want, lo, hi)
 13.         n.x ← n.x + (want - n.x) * 0.55              // relaxation factor
```

**LAY-153.** The pass count MUST be **12** and the reference direction MUST alternate (line 1), for the same reason as the crossing sweep: aligning only with parents leaves children misaligned.

**LAY-154.** Nodes MUST be relaxed in **descending in-view degree order** (line 3) — this is the "priority" in priority relaxation. High-degree nodes move first and claim the position their many neighbours want; low-degree nodes then fit into the space that remains. Relaxing in row order instead lets an arbitrary leaf take a position a hub needed.

**LAY-155.** The index `i` used for the left and right neighbours MUST be the node's index in the **row** (captured before the priority sort), not its index in the priority order. Constraints are geometric and must refer to geometric neighbours.

**LAY-156.** The separation constraints (lines 9 and 10) MUST be computed from the current positions of the immediate left and right neighbours, so no relaxation step can create an overlap. Missing neighbours give unbounded freedom on that side.

**LAY-157.** The infeasible case `lo > hi` MUST be skipped (line 11), not forced. It arises when a row is packed so tightly that a node has no legal position between its neighbours; moving it anyway would create an overlap that nothing later removes.

**LAY-158.** The relaxation factor MUST be **0.55** — each pass closes 55 per cent of the remaining gap between the node's position and its target. Over 12 alternating passes this converges smoothly without the overshoot a factor of 1.0 would cause.

**LAY-159.** The **mean** of the reference positions MUST be used at line 7, not the median. The median is the right choice for *ordering* ([§6.4](#64-crossing-reduction)) because it is robust to outliers and preserves order; the mean is the right choice for *positioning* because it balances a node between all its neighbours rather than ignoring the extremes.

**LAY-160.** Final positions MUST then be assigned and velocities cleared `[src: layoutHierarchy()]`:

```
for i, row r in rows:
    for each n in r: n.y ← i * gapY ; n.vx ← 0 ; n.vy ← 0
centreNodes(all nodes)
```

**LAY-161.** Velocities MUST be zeroed. A subsequent switch to force mode without a fresh re-seed would otherwise inherit stale velocities and jerk.

**LAY-162.** The layout MUST finish with the shared centring primitive (**LAY-37**). The hierarchy engine publishes no decorations, so **LAY-41** imposes no further obligation on it.

### 6.6 Elbow edge routing — a geometric contract

**LAY-163.** The hierarchy layout guarantees, and the renderer MAY rely on, these geometric properties:

1. Every node in layer `i` has `y = i × 124` before centring, and `y = i × 124 + dy` after, for the single centring offset `dy` shared by all nodes.
2. Every hierarchy edge runs from a node in layer `i` to a node in layer `j` with `j < i` — strictly upward, by **LAY-127**.
3. Layers are separated by exactly 124 world units, so the vertical clearance between any two adjacent layers is `124 - (r_child + r_parent)`, at least `124 - 35 = 89` units.
4. Within a row, adjacent nodes are separated by at least `gapX = 20` world units of clear space between their width boxes.

**LAY-164.** Given those guarantees, the renderer MUST route hierarchy edges as **elbows** — a vertical segment from the child, a horizontal segment at an intermediate height, and a vertical segment into the parent — rather than as straight chords. The contract the renderer MUST honour:

- The elbow's horizontal segment MUST lie strictly between the two layers' `y` values, so it cannot cross a node.
- The horizontal segment SHOULD be placed at the midpoint of the gap, `y_child - 62`, so that elbows from different children of the same parent share a height and merge visually into a bracket.
- Corners SHOULD be rounded with a radius no greater than half the shortest of the three segments, so that a short elbow does not degenerate.
- Non-hierarchy edges in a hierarchy layout MUST NOT be elbowed; they connect arbitrary layers and MUST be drawn as chords, with the parallel-edge fan of [§3](#3-parallel-edge-indexing) applied.

This is the full extent of the hierarchy engine's obligation to the renderer. Stroke, colour, arrowheads and label placement are [Rendering](22-graph-rendering-and-export.md)'s.

### 6.7 Complexity

**LAY-165.** Hierarchy layout MUST be:

| Stage | Cost |
|---|---|
| Adjacency build | `O(n + m)` |
| Layer assignment | `O(n + m)` — memoised depth-first |
| Fallback pass | `O(n + m)` |
| Initial DFS order | `O(n + m + sum over u of \|kids[u]\| log \|kids[u]\|)` |
| Crossing reduction | `O(8 × (m + sum over rows of \|r\| log \|r\|))`, skipped when any row exceeds 260 |
| Initial packing | `O(n)` |
| Priority relaxation | `O(12 × (m + sum over rows of \|r\| log \|r\|))` |
| Centring | `O(n)` |

Overall `O(n log n + m)` with constants around 20 sweeps. At the `auto` ceiling of 400 nodes this is comfortably under 20 ms.

### 6.8 Hierarchy: when to use, what it guarantees, what it does not

**When to use.** A taxonomic view: at least 78 per cent hierarchy edges, at least half as many edges as nodes, at most 400 nodes (**LAY-7**, line 10). Or explicitly, whenever the user's question is "what is above and below this?".

**What it guarantees.**
- Every hierarchy edge points strictly downward (**LAY-127**).
- Subclass depth maps exactly to vertical position; two classes at the same depth sit on the same line.
- No two nodes in a row overlap, with at least 20 world units of clear space (**LAY-156**).
- Siblings start adjacent and in alphabetical order (**LAY-136**).
- Deterministic output for identical input.
- Computed once; no animation, zero per-frame cost.

**What it does not guarantee.**
- **No crossing minimum.** The median heuristic is a heuristic, and above 260 nodes in a row it does not run at all (**LAY-146**).
- **No bounded width.** A class with 300 subclasses produces a row 300 nodes wide. Nothing prevents it; the `auto` ceiling of 400 nodes limits the damage but an explicit choice of hierarchy does not.
- **No sensible drawing of cyclic input.** The cycle guard prevents a crash and produces *a* layering, but a cyclic taxonomy has no correct layering.
- **No handling of non-hierarchy edges.** Restriction, domain, range and inverse edges are laid out only incidentally, by the fallback rule (**LAY-129**), and may cross many layers.
- **No stability under change.** Adding one class can change the layer of many nodes and re-order every row.

### 6.9 Worked example — Subgraph T8

Take Subgraph T8 from [§1.4](#14-worked-example-of-the-heuristic): eight classes, seven `rdfs:subClassOf` edges, `auto` resolving to hierarchy.

**Adjacency.** Every edge is in `HIER_PREDS` and every edge runs child → parent:

```
pars[CheeseTopping]      = [PizzaTopping]      kids[PizzaTopping]      = [CheeseTopping, VegetableTopping]
pars[VegetableTopping]   = [PizzaTopping]      kids[CheeseTopping]     = [MozzarellaTopping, ParmesanTopping]
pars[MozzarellaTopping]  = [CheeseTopping]     kids[VegetableTopping]  = [PepperTopping, TomatoTopping]
pars[ParmesanTopping]    = [CheeseTopping]     kids[PepperTopping]     = [GreenPepperTopping]
pars[PepperTopping]      = [VegetableTopping]
pars[TomatoTopping]      = [VegetableTopping]
pars[GreenPepperTopping] = [PepperTopping]
```

**Layers** (**LAY-126**):

| Layer | Nodes |
|---|---|
| 0 | `pizza:PizzaTopping` |
| 1 | `pizza:CheeseTopping`, `pizza:VegetableTopping` |
| 2 | `pizza:MozzarellaTopping`, `pizza:ParmesanTopping`, `pizza:PepperTopping`, `pizza:TomatoTopping` |
| 3 | `pizza:GreenPepperTopping` |

No node lacks a hierarchy edge, so the fallback rule does not fire.

**Initial order** (**LAY-134**). The root pops first. Its children sorted descending by local name are `[VegetableTopping, CheeseTopping]`, pushed in that order, so `CheeseTopping` is on top and pops first. The traversal yields:

```
PizzaTopping, CheeseTopping, MozzarellaTopping, ParmesanTopping,
VegetableTopping, PepperTopping, GreenPepperTopping, TomatoTopping
```

Rows sorted by that index:

- Row 1: `CheeseTopping` (1), `VegetableTopping` (4)
- Row 2: `MozzarellaTopping` (2), `ParmesanTopping` (3), `PepperTopping` (5), `TomatoTopping` (7)
- Row 3: `GreenPepperTopping` (6)

Subtrees are already contiguous: the two cheese children sit together on the left, the two vegetable children on the right. There are zero crossings before the sweep runs.

**Crossing reduction.** No row exceeds 260, so eight passes run. Pass 0 looks up: in row 2, `MozzarellaTopping` and `ParmesanTopping` both take median `pos[CheeseTopping] = 0`, and `PepperTopping` and `TomatoTopping` both take median `pos[VegetableTopping] = 1`. The keys are `(0, 0, 1, 1)`, already ascending, and the tie-break on current position leaves the order unchanged. The layout is already crossing-free and the heuristic correctly does nothing.

**Widths** (**LAY-148**), taking `r = 10` for every node for simplicity — the floor is `2 × 10 + 18 = 38`:

| Node | Label length | `len × 6.8 + 16` | Width |
|---|---|---|---|
| `PizzaTopping` | 12 | 97.6 | 97.6 |
| `CheeseTopping` | 13 | 104.4 | 104.4 |
| `VegetableTopping` | 16 | 124.8 | 124.8 |
| `MozzarellaTopping` | 17 | 131.6 | 131.6 |
| `ParmesanTopping` | 15 | 118.0 | 118.0 |
| `PepperTopping` | 13 | 104.4 | 104.4 |
| `TomatoTopping` | 13 | 104.4 | 104.4 |
| `GreenPepperTopping` | 18 | 138.4 | 138.4 |

**Initial packing of row 2** (**LAY-151**): widths `131.6, 118.0, 104.4, 104.4` with `gapX = 20`. Centres at `65.8, 205.6, 375.8, 500.0`; total `582.4`; after centring on zero: `−225.4, −85.6, 84.6, 208.8`.

**Relaxation** (**LAY-152**). Pass 0 looks at parents. Row 2 is relaxed in descending in-view degree: `PepperTopping` (degree 2: one parent, one child) first, then the three degree-1 nodes in row order.

`PepperTopping` wants `x = pos(VegetableTopping)`. Row 1 packed to widths `104.4, 124.8`: centres `52.2, 176.6`, total `249.2`, centred to `−72.4, 52.0`. So `VegetableTopping` is at `52.0` and `PepperTopping` wants `52.0`. Its constraints: left neighbour `ParmesanTopping` at `−85.6` with half-width `59.0` gives `lo = −85.6 + 59.0 + 20 + 52.2 = 45.6`; right neighbour `TomatoTopping` at `208.8` with half-width `52.2` gives `hi = 208.8 − 52.2 − 20 − 52.2 = 84.4`. The target `52.0` is feasible, so `PepperTopping` moves to `84.6 + (52.0 − 84.6) × 0.55 = 66.7`.

Twelve alternating passes converge to a drawing where each parent sits at the mean of its children and each child sits under its parent, with the vegetable subtree to the right of the cheese subtree.

**Final `y` values**: 0, 124, 248, 372, then shifted by the centring offset `dy = −186`, giving `−186, −62, 62, 186`.

---

## 7. Radial tree

Rings of breadth-first depth around the Focus set, with wedge width proportional to subtree leaf count. Computed once; no animation.

### 7.1 Root selection

**LAY-166.** Roots MUST be selected as the resident members of the Focus set, with a maximum-degree fallback `[src: layoutRadial()]`:

```
  1. roots ← [ u in focus where u is resident ]
  2. if roots is empty:
  3.     best ← the resident node with the greatest shownDeg
  4.            (ties broken by node-map iteration order: the first such node wins)
  5.     roots ← [best.iri] when best exists
  6. if roots is empty: return                  // empty viewport; nothing to do
```

**LAY-167.** The Focus set MUST be preferred, because radial is chosen by `auto` precisely when the view is a single-focus exploration (**LAY-7**, line 11) and the focus is by definition the thing the exploration is about.

**LAY-168.** The fallback MUST be maximum **in-view** degree, not true degree. The most connected node *in the picture* is the natural centre of the picture; the most connected node in the Store may be a leaf here.

**LAY-169.** The tie-break MUST be deterministic — node-map iteration order, which is admission order (**LAY-166**, line 4). The strict inequality `n.shownDeg > best.shownDeg` keeps the first maximum.

**LAY-170.** Multiple roots MUST be supported. They share the full circle, apportioned by leaf count (**LAY-179**).

### 7.2 Breadth-first depth and children

**LAY-171.** Depth and the child relation MUST be assigned by a breadth-first sweep over the **undirected** neighbour relation `[src: layoutRadial()]`:

```
  1. nbr ← undirected adjacency over viewEdges()
  2. depth ← empty map ; children ← map from every iri to []
  3. q ← empty array
  4. for each r in roots: if depth lacks r: depth[r] ← 0 ; append r to q
  5. for i from 0 while i < |q|:                   // array-as-queue; q grows as we go
  6.     u ← q[i]
  7.     for each v in nbr[u]:
  8.         if depth contains v: continue         // first visit wins
  9.         depth[v] ← depth[u] + 1
 10.         children[u].append(v)
 11.         append v to q
```

**LAY-172.** The traversal MUST be over the undirected relation, ignoring predicate and direction. Radial depth is *hop distance in the picture*, not taxonomic depth; a restriction filler is as much a neighbour as a subclass.

**LAY-173.** The traversal MUST build a **spanning tree**: the first visit to a node fixes both its depth and its parent (line 8). Every non-tree edge is drawn but does not affect placement. This is what makes the layout a *tree* layout over a graph that is not a tree.

**LAY-174.** The queue MUST be an array consumed by index (line 5), never a structure that discards consumed entries, because the completed array is reused in reverse as the post-order for leaf counting (**LAY-176**).

**LAY-175.** Nodes not reached by the traversal — **disconnected nodes** — MUST be collected, the maximum depth incremented, and all of them assigned that new outermost depth `[src: layoutRadial()]`:

```
  1. maxD ← max over depth values
  2. orphans ← [ n in nodes where depth lacks n.iri ]
  3. if orphans is non-empty: maxD ← maxD + 1 ; for each n in orphans: depth[n.iri] ← maxD
```

### 7.3 Leaf-count weighting

**LAY-176.** Subtree leaf counts MUST be computed by traversing the breadth-first queue **in reverse**, without recursion `[src: layoutRadial()]`:

```
  1. leaves ← empty map
  2. for i from |q| - 1 down to 0:
  3.     u  ← q[i]
  4.     cs ← children[u]
  5.     if cs is empty: leaves[u] ← 1 ; continue
  6.     s ← 0
  7.     for each c in cs: s ← s + (leaves[c] or 1)
  8.     leaves[u] ← s
```

**LAY-177.** Reverse breadth-first order MUST be used, and the reason MUST be understood: in a breadth-first queue every child appears strictly after its parent, so iterating the queue backwards visits every child before its parent — a valid post-order. This gives the leaf counts with no recursion, no explicit stack and no risk of stack overflow on a deep tree. The source states the intent: *"leaf counts, computed in reverse BFS order so no recursion is needed"* `[src: layoutRadial()]`.

**LAY-178.** The `or 1` fallback at line 7 MUST be retained as a defensive default for a child with no computed count, which cannot occur given **LAY-177** but costs nothing to guard.

**LAY-179.** Leaf count MUST be the weighting for wedge width, not child count and not subtree node count. Leaf count is the number of *terminal* items the subtree must display around a ring, and it is the quantity that actually determines how much angular space the subtree needs.

### 7.4 Ring radius sizing

**LAY-180.** Ring radii MUST be computed outward, each ring being the greater of a fixed step from the previous ring and the radius needed to fit that ring's own population `[src: layoutRadial()]`:

```
  1. countAt ← array of length maxD + 1, counting nodes at each depth
  2. radii[0] ← 0
  3. for d from 1 to maxD:
  4.     circumferenceNeed ← countAt[d] * 52 / (2 * pi)
  5.     radii[d] ← max(radii[d-1] + 118, circumferenceNeed)
```

| Constant | Value | Role |
|---|---|---|
| Ring step | `118` world units | Minimum radial separation between consecutive rings |
| Per-node arc allowance | `52` world units | Arc length each node needs on its ring |

**LAY-181.** The circumference term MUST be derived from the requirement that `countAt[d]` nodes each occupying 52 units of arc fit on a circle of circumference `2πr`: `countAt[d] × 52 <= 2πr`, hence `r >= countAt[d] × 52 / 2π`. This is the whole reason the layout does not collapse when one ring is far more populous than the others.

**LAY-182.** The maximum MUST be taken with the previous ring's radius plus the step (line 5), so rings can never touch or invert no matter how sparse an outer ring is.

**LAY-183.** Ring radii MUST be monotonically increasing. This follows from **LAY-182** and MUST be preserved by any reformulation.

**LAY-184.** The arc allowance of 52 world units MUST exceed twice the maximum node radius (`2 × 17.5 = 35`), leaving at least 17 units of clear arc between adjacent nodes on the same ring before the collision post-pass runs.

**Worked sizing.** A ring with 40 nodes needs `40 × 52 / 6.2832 = 331.0` units of radius. If the previous ring is at 118, the fixed step would give 236 — so the circumference term wins and the ring is placed at 331. A ring with 10 nodes needs `82.8`; the fixed step from 331 gives 449 — so the step wins.

### 7.5 Wedge allocation and placement

**LAY-185.** Placement MUST be recursive over the spanning tree, each node taking the mid-angle of its wedge and dividing that wedge among its children in proportion to leaf count `[src: layoutRadial()]`:

```
place(u, a0, a1):
  1. n ← nodes[u] ; if absent: return
  2. d   ← depth[u]
  3. mid ← (a0 + a1) / 2
  4. n.x ← cos(mid) * radii[d] ; n.y ← sin(mid) * radii[d]
  5. n.vx ← 0 ; n.vy ← 0
  6. cs ← children[u] ; if empty: return
  7. total ← sum over c in cs of (leaves[c] or 1)
  8. a ← a0
  9. for each c in cs:
 10.     span ← (a1 - a0) * (leaves[c] or 1) / max(total, 1)
 11.     place(c, a, a + span)
 12.     a ← a + span
```

**LAY-186.** Roots MUST divide the full circle in proportion to their own leaf counts, starting at `−π/2` — straight up `[src: layoutRadial()]`:

```
  1. totalLeaves ← sum over r in roots of (leaves[r] or 1)
  2. a ← -pi / 2
  3. for each r in roots:
  4.     span ← 2 * pi * (leaves[r] or 1) / max(totalLeaves, 1)
  5.     place(r, a, a + span)
  6.     a ← a + span
```

**LAY-187.** The start angle MUST be `−π/2`. With screen coordinates increasing downward, this puts the first root's wedge at the top of the circle, which is where a reader expects a tree to begin.

**LAY-188.** A single root MUST receive the full `2π` wedge and MUST be placed at `radii[0] = 0` — the origin — regardless of its mid-angle, since `cos(mid) × 0 = 0`.

**LAY-189.** Wedges MUST be allocated in `children` order, which is breadth-first discovery order, which is deterministic.

**LAY-190.** Children MUST be placed within a wedge that is a strict subdivision of the parent's, so subtrees never interleave and the drawing reads as nested sectors.

**LAY-191.** Disconnected nodes MUST be distributed evenly around the outermost ring `[src: layoutRadial()]`:

```
for i, n in orphans:
    ang ← (i / max(1, |orphans|)) * 2 * pi
    n.x ← cos(ang) * radii[maxD] ; n.y ← sin(ang) * radii[maxD]
    n.vx ← 0 ; n.vy ← 0
```

**LAY-192.** Disconnected nodes MUST go on the **outer** ring, not the centre and not off to one side. They are the least related things in the view, and radius already means "unrelatedness to the focus" — so the outer ring is the semantically correct place for them, and it is also the ring with the most room.

### 7.6 Post-pass and ring bookkeeping

**LAY-193.** A collision relaxation of exactly **3** iterations MUST run after placement `[src: layoutRadial()]`, using the pass of [§5.8](#58-collision-resolution). Wedge allocation guarantees angular separation but not Euclidean separation: two nodes in narrow adjacent wedges on the same ring can still overlap when the ring is small, and a deep narrow subtree can place a child almost radially behind its parent.

**LAY-194.** Three iterations MUST be used — more than the force engine's one or two — because this is a one-shot layout with no subsequent ticks to finish the job.

**LAY-195.** After the collision pass, the ring radii MUST be published for the renderer, **excluding ring 0** `[src: layoutRadial()]`:

```
radialRings ← radii[1 .. maxD]
```

Ring 0 has radius 0 and drawing it would put a dot on the root.

**LAY-196.** Centring MUST then run (**LAY-37**), and the **ring origin** MUST be recorded as the **post-centring position of the first root** `[src: layoutRadial()]`:

```
centreNodes(all nodes)
c ← nodes[roots[0]]
ringOrigin ← c exists ? { x: c.x, y: c.y } : { x: 0, y: 0 }
```

**LAY-197.** The ring origin MUST be read *after* centring, not before. This is the concrete discharge of the decoration obligation of **LAY-41**: the rings are drawn in world space concentric with the root, so recording the root's final position is exactly equivalent to shifting the ring centre by the centring offset, and is less error-prone.

**LAY-198.** The origin MUST fall back to the world origin when the first root has somehow left the view.

**LAY-199.** With multiple roots the rings are concentric with the **first** root only. This is an acknowledged approximation: with two roots the rings are decorative rather than exact, and the renderer SHOULD suppress ring decoration when `|roots| > 1`.

**Status:** the multi-root ring suppression is specified, not implemented in the reference build.

### 7.7 Complexity

**LAY-200.** Radial layout MUST be:

| Stage | Cost |
|---|---|
| Adjacency build | `O(n + m)` |
| Breadth-first sweep | `O(n + m)` |
| Leaf counting | `O(n)` |
| Ring sizing | `O(n + maxD)` |
| Placement | `O(n)` — each node placed once, recursion depth bounded by `maxD` |
| Collision post-pass | `O(3n)` expected |
| Centring | `O(n)` |

Overall `O(n + m)` — the cheapest of the four engines.

**LAY-201.** Placement recursion depth equals the maximum breadth-first depth. For a Viewport of at most 3,000 nodes this is bounded by 3,000 in the pathological case of a path graph; implementations on platforms with small stacks SHOULD convert it to an explicit stack.

### 7.8 Radial: when to use, what it guarantees, what it does not

**When to use.** A single-focus exploration: at most two Focus members and more than 14 nodes (**LAY-7**, line 11). Or explicitly, whenever the user's question is "how far is everything from this?".

**What it guarantees.**
- Hop distance from the Focus set maps exactly to distance from the centre; the reader can count hops by counting rings.
- Every ring is large enough to hold its own population at 52 world units of arc per node (**LAY-181**).
- Rings are strictly increasing and never touch (**LAY-182**).
- Subtrees occupy disjoint angular sectors and never interleave (**LAY-190**).
- Wedge width is proportional to leaf count, so a big subtree gets the room it needs (**LAY-179**).
- No node overlaps another after the three-iteration post-pass (**LAY-193**).
- Deterministic output for identical input.

**What it does not guarantee.**
- **No crossing minimum.** Non-tree edges — every edge not in the spanning tree — are drawn as chords and may cross anything.
- **No taxonomic meaning.** Rings are hop distance, not subclass depth. A subclass three restrictions away sits on ring 3 alongside a sibling one subclass hop away via two other edges.
- **No stability.** Changing the Focus set re-roots the tree and moves everything.
- **No bounded outer radius.** A ring of 2,000 nodes is placed at radius `2000 × 52 / 2π ≈ 16,550` world units; fit-to-view will zoom out to about 0.05, where nodes are dots.
- **No correct rings for multiple roots** (**LAY-199**).

### 7.9 Worked example — Subgraph R

**Subgraph R** is defined for this document as the Margherita neighbourhood of Subgraph M extended by one hop, drawn from real fixture axioms `[src: CLASS_SPEC, NAMED_PIZZAS]`. Focus: `{ pizza:Margherita }`.

```
pizza:Margherita —rdfs:subClassOf→          pizza:NamedPizza
pizza:Margherita —pizza:hasTopping→         pizza:MozzarellaTopping
pizza:Margherita —pizza:hasTopping→         pizza:TomatoTopping
pizza:Margherita —pizza:hasCountryOfOrigin→ pizza:Italy
pizza:NamedPizza —rdfs:subClassOf→          pizza:Pizza
pizza:MozzarellaTopping —rdfs:subClassOf→   pizza:CheeseTopping
pizza:TomatoTopping —rdfs:subClassOf→       pizza:VegetableTopping
pizza:CheeseTopping —rdfs:subClassOf→       pizza:PizzaTopping
pizza:VegetableTopping —rdfs:subClassOf→    pizza:PizzaTopping
```

Nine nodes, nine edges.

**Roots**: `[pizza:Margherita]`, from the Focus set.

**Breadth-first sweep** from Margherita, with neighbours visited in edge-insertion order:

| Node | Depth | Parent | Children |
|---|---|---|---|
| `Margherita` | 0 | — | NamedPizza, MozzarellaTopping, TomatoTopping, Italy |
| `NamedPizza` | 1 | Margherita | Pizza |
| `MozzarellaTopping` | 1 | Margherita | CheeseTopping |
| `TomatoTopping` | 1 | Margherita | VegetableTopping |
| `Italy` | 1 | Margherita | — |
| `Pizza` | 2 | NamedPizza | — |
| `CheeseTopping` | 2 | MozzarellaTopping | PizzaTopping |
| `VegetableTopping` | 2 | TomatoTopping | — |
| `PizzaTopping` | 3 | CheeseTopping | — |

Note that `VegetableTopping → PizzaTopping` is a **non-tree edge**: `PizzaTopping` was already reached from `CheeseTopping`. It is drawn but does not affect placement — a direct illustration of **LAY-173**.

**Queue**: `[Margherita, NamedPizza, MozzarellaTopping, TomatoTopping, Italy, Pizza, CheeseTopping, VegetableTopping, PizzaTopping]`.

**Leaf counts**, computed backwards over that queue (**LAY-176**):

| Step | Node | Children | Leaves |
|---|---|---|---|
| 8 | `PizzaTopping` | none | 1 |
| 7 | `VegetableTopping` | none | 1 |
| 6 | `CheeseTopping` | PizzaTopping | 1 |
| 5 | `Pizza` | none | 1 |
| 4 | `Italy` | none | 1 |
| 3 | `TomatoTopping` | VegetableTopping | 1 |
| 2 | `MozzarellaTopping` | CheeseTopping | 1 |
| 1 | `NamedPizza` | Pizza | 1 |
| 0 | `Margherita` | four children | 4 |

**Ring sizing** (**LAY-180**): `countAt = [1, 4, 3, 1]`, `maxD = 3`.

| `d` | `countAt[d]` | `countAt × 52 / 2π` | `radii[d-1] + 118` | `radii[d]` |
|---|---|---|---|---|
| 0 | 1 | — | — | 0 |
| 1 | 4 | 33.1 | 118 | **118** |
| 2 | 3 | 24.8 | 236 | **236** |
| 3 | 1 | 8.3 | 354 | **354** |

The fixed step wins at every ring — this view is sparse, so the circumference term never binds.

**Wedges.** One root with four leaves takes the full circle from `−π/2`. Each of its four children has leaf count 1, so each takes a quarter: `π/2` each.

| Node | Wedge | Mid-angle | Position (radius 118) |
|---|---|---|---|
| `NamedPizza` | `[−π/2, 0]` | `−π/4` = −45° | `(83.4, −83.4)` |
| `MozzarellaTopping` | `[0, π/2]` | `π/4` = 45° | `(83.4, 83.4)` |
| `TomatoTopping` | `[π/2, π]` | `3π/4` = 135° | `(−83.4, 83.4)` |
| `Italy` | `[π, 3π/2]` | `5π/4` = 225° | `(−83.4, −83.4)` |

Each ring-1 node with one child passes its whole wedge down, so at ring 2: `Pizza` at mid `−π/4` → `(166.9, −166.9)`; `CheeseTopping` at mid `π/4` → `(166.9, 166.9)`; `VegetableTopping` at mid `3π/4` → `(−166.9, 166.9)`. At ring 3, `PizzaTopping` inherits `CheeseTopping`'s wedge, mid `π/4` → `(250.3, 250.3)`.

Each branch therefore runs radially outward along its own diagonal — the classic radial signature, with the non-tree edge from `VegetableTopping` to `PizzaTopping` cutting across between the two lower branches.

**Post-pass and bookkeeping.** Three collision iterations run; nothing overlaps here, so nothing moves. `radialRings = [118, 236, 354]`. Centring shifts everything by the offset that centres the bounding box `(−166.9, −166.9)` to `(250.3, 250.3)` — namely `dx = dy = −41.7` — and `ringOrigin` is then read as Margherita's post-centring position `(−41.7, −41.7)`.

---

## 8. Cluster grid

Packed, aligned blocks grouped by type. Computed once; no animation. This is the mode that makes a population of Individuals legible.

### 8.1 Grouping key derivation

**LAY-202.** Every node MUST be assigned a grouping key by this cascade, in this order `[src: layoutGrid()]`:

```
keyOf(n):
  1. rec ← store.indIndex[n.iri]
  2. if rec exists: return rec.type                       // generated Individual: its class
  3. if n.kind = individual: return demo:Customer          // other Individual: the customer class
  4. e ← store.ent[n.iri]
  5. if e exists and e.parents is non-empty: return e.parents[0]   // class or property: first parent
  6. return "kind:" + n.kind                               // fallback: group by Kind
```

**LAY-203.** Rule 2 MUST take the Individual's asserted type directly from the ABox index. This is the common case at scale and MUST be the fastest path — one map lookup, no adjacency walk.

**LAY-204.** Rule 3 is a fixture-specific fallback: an Individual not in the ABox index is a generated customer, whose class is `demo:Customer` `[src: layoutGrid()]`. An implementation over a different Store MUST replace this with a lookup of the Individual's first asserted type, and MUST fall through to rule 6 when there is none.

**LAY-205.** Rule 5 MUST use the **first** parent, not all parents. Multiple inheritance would otherwise place a node in several groups or in none; taking the first gives a total function and a stable one, since parent lists are built in a deterministic order `[src: buildTBox()]`.

**LAY-206.** Rule 6 MUST prefix the Kind with `"kind:"` so that a Kind-derived key can never collide with an IRI-derived key (**LAY-210**).

**LAY-207.** The key is a **grouping** device, not a semantic claim. Two classes sharing a first parent land in the same block; that is the intended reading — "these are siblings" — and nothing more.

### 8.2 Block construction

**LAY-208.** Each group MUST be sorted and shaped into a block `[src: layoutGrid()]`:

```
CELL_G = 36

for each (key, ns) in groups:
  1. sort ns ascending by label
  2. cols ← max(1, ceil(sqrt(|ns| * 1.8)))
  3. rows ← ceil(|ns| / cols)
  4. w    ← cols * 36 + 24
  5. h    ← rows * 36 + 46
blocks ← all such blocks, sorted DESCENDING by |ns|
```

| Constant | Value | Role |
|---|---|---|
| `CELL_G` | `36` world units | Grid pitch in both axes |
| Aspect factor | `1.8` | Column count is `ceil(sqrt(count × 1.8))`, giving blocks wider than tall |
| Horizontal padding | `24` world units | Total, 12 each side |
| Vertical padding | `46` world units | 36 above for the group label, 10 below |

**LAY-209.** Members MUST be sorted by **label**, ascending. Within a block of a thousand Individuals, alphabetical order is the only thing that makes any individual findable by eye.

**LAY-210.** Column count MUST be `ceil(sqrt(count × 1.8))`. The factor of 1.8 makes the block roughly 1.34 times wider than tall (`sqrt(1.8) ≈ 1.342`), which packs better into the row-wrapping pass of [§8.3](#83-row-wrapping-pack) and matches the aspect of a typical viewport.

| Population | `cols` | `rows` | `w` | `h` |
|---|---|---|---|---|
| 1 | 2 | 1 | 96 | 82 |
| 9 | 5 | 2 | 204 | 118 |
| 22 | 7 | 4 | 276 | 190 |
| 100 | 14 | 8 | 528 | 334 |
| 600 | 33 | 19 | 1,212 | 730 |
| 1,000 | 43 | 24 | 1,572 | 910 |

**LAY-211.** The vertical padding MUST be asymmetric — 36 units above and 10 below — because the renderer draws the group's label and count in the space above the first row. This is a geometric contract the renderer MUST honour: the top 36 units of every group frame are reserved for the header and MUST NOT contain a node.

**LAY-212.** Blocks MUST be ordered by descending population before packing. Largest-first is a standard and effective bin-packing heuristic, and it also puts the most important group — the biggest one — at the top left, where the reader looks first.

### 8.3 Row-wrapping pack

**LAY-213.** Blocks MUST be packed into rows against a target width derived from the total area `[src: layoutGrid()]`:

```
  1. area    ← sum over blocks of (b.w * b.h)
  2. targetW ← max(700, sqrt(area) * 1.6)
  3. x ← 0 ; y ← 0 ; rowH ← 0
  4. for each block b, in descending population order:
  5.     if x > 0 and x + b.w > targetW:
  6.         x ← 0 ; y ← y + rowH + 48 ; rowH ← 0     // wrap to a new row
  7.     b.x ← x ; b.y ← y
  8.     for i, n in b.ns:
  9.         n.x ← x + 12 + (i mod b.cols) * 36 + 18
 10.         n.y ← y + 36 + floor(i / b.cols) * 36 + 18
 11.         n.vx ← 0 ; n.vy ← 0
 12.     x    ← x + b.w + 40
 13.     rowH ← max(rowH, b.h)
```

| Constant | Value | Role |
|---|---|---|
| Minimum target width | `700` world units | Floor, so a view with two small groups is not stacked vertically |
| Area-to-width factor | `1.6` | Target width is 1.6 times the square root of the total block area |
| Inter-block horizontal gap | `40` world units | |
| Inter-row vertical gap | `48` world units | |
| Left inset | `12` world units | Plus half a cell (18) to reach the first node's centre |
| Top inset | `36` world units | The header band, plus half a cell (18) |

**LAY-214.** The target width MUST be derived from the **square root of the total area**, scaled by 1.6. Deriving it from the area rather than from a fixed constant means the packed result has a roughly constant aspect ratio regardless of how many nodes are in view, so fit-to-view produces a similar zoom whether there are 600 nodes or 3,000.

**LAY-215.** The wrap condition MUST include `x > 0` (line 5), so a single block wider than the target width still gets placed rather than looping forever on an empty row.

**LAY-216.** Node centres MUST be placed at the cell centre: left inset 12 plus half a cell 18 horizontally, top inset 36 plus half a cell 18 vertically (lines 9 and 10). With `CELL_G = 36` and a maximum node radius of 17.5, the clearance between adjacent cell centres is `36 - 35 = 1` world unit in the worst case — adjacent maximum-radius nodes nearly touch, which is acceptable because grid mode is dominated by Individuals whose radius is near the 5.5 minimum, giving 25 units of clearance.

**LAY-217.** Members MUST fill **row-major** — across before down (lines 9 and 10) — so that the alphabetical order of **LAY-209** reads left to right, top to bottom, in the same direction as text.

**LAY-218.** Velocities MUST be zeroed (line 11), for the reason in **LAY-161**.

**LAY-219.** The grid layout MUST NOT run a collision pass. Cells cannot overlap by construction, and a relaxation pass would break the alignment that is the entire point of the mode.

### 8.4 Group frame records

**LAY-220.** After centring, the layout MUST publish one frame record per block, in final world coordinates `[src: layoutGrid()]`:

```
shift ← centreNodes(all nodes)
groupBlocks ← [ { x: b.x + shift.dx, y: b.y + shift.dy,
                  w: b.w, h: b.h,
                  label: groupLabel(b.key), count: |b.ns| }
                for each block b ]
```

**LAY-221.** The centring offset MUST be added to every frame's origin. This is the concrete discharge of **LAY-41** for this engine; without it the frames stay where the packer put them and the nodes slide out from under them.

**LAY-222.** Width and height MUST NOT be shifted — only the origin. Centring is a translation.

**LAY-223.** The group label MUST be derived as `[src: layoutGrid()]`:

```
groupLabel(key):
  1. if key starts with "kind:":
  2.     return the display label of that Kind, or "Other" when unknown
  3. return humanise(localName(key))
```

where `humanise` inserts a space at each lower-to-upper-case boundary and replaces underscores with spaces `[src: humanise()]` — so `pizza:MozzarellaTopping` becomes "Mozzarella Topping".

**LAY-224.** The frame record's contract with the renderer:

- `(x, y, w, h)` is the frame rectangle in world coordinates.
- The top 36 world units are the header band and contain no node (**LAY-211**).
- `label` and `count` MUST both be drawn in the header band; the count is what makes the block's size legible as a number rather than as an area.
- Frames MUST be drawn beneath all edges and nodes.
- Frames MUST NOT be hit-testable; they are decoration. See [Graph viewport and Budget, §12.5](20-graph-viewport-and-budget.md#125-hover).

**LAY-225.** The frame list MUST be cleared at the start of every relayout (**LAY-18**), so a switch away from grid removes the frames.

### 8.5 Complexity

**LAY-226.** Grid layout MUST be:

| Stage | Cost |
|---|---|
| Grouping | `O(n)` expected — one map lookup and one hash insert per node |
| Per-group sort | `O(sum over groups of g log g)`, at most `O(n log n)` |
| Block sizing | `O(number of groups)` |
| Block sort | `O(g log g)` in the number of groups |
| Packing and placement | `O(n + g)` |
| Centring | `O(n)` |
| Frame records | `O(g)` |

Overall `O(n log n)`, dominated by the per-group alphabetical sorts, with a very small constant. At 3,000 nodes this is under 5 ms.

**LAY-227.** Grid MUST be the cheapest mode per *frame*, at exactly zero: it computes once and never ticks.

### 8.6 Grid: when to use, what it guarantees, what it does not

**When to use.** A population rather than a structure: more than 300 nodes with over 55 per cent `rdf:type` edges, or more than 500 nodes of any shape (**LAY-7**, lines 8 and 9). Or explicitly, whenever the user's question is "how many of each, and what are they called?".

**What it guarantees.**
- No two nodes overlap, by construction (**LAY-219**).
- Every node is in exactly one group, and the grouping is a total function (**LAY-202**).
- Members are in alphabetical order, row-major (**LAY-209**, **LAY-217**).
- Every group is labelled and counted (**LAY-224**).
- The packed result has a roughly constant aspect ratio regardless of population (**LAY-214**).
- Legibility does not degrade with node count — a block of 3,000 is exactly as readable as a block of 300, just bigger.
- Deterministic output for identical input.
- Zero per-frame cost.

**What it does not guarantee.**
- **Position carries no topological meaning at all.** Two adjacent nodes in a block are adjacent because their labels sort adjacently, not because they are related. This is the trade the mode makes, and it MUST be understood as deliberate.
- **Edges are not routed.** They are drawn as chords between grid positions and will cross blocks freely. A grid view with many inter-group edges is a mess of chords; the mode is for views where the edges are overwhelmingly `rdf:type` and therefore all point at the same few class nodes.
- **No grouping quality.** The first-parent rule (**LAY-205**) is arbitrary under multiple inheritance.
- **No bound on block count.** A view of 500 classes with 500 distinct first parents produces 500 blocks of one node each, which is worse than force. The `auto` heuristic's type-dominance test (**LAY-7**, line 8) exists to avoid exactly this, but the unconditional floor at 500 nodes (line 9) can still hit it.

### 8.7 Worked example — Subgraph P

**Subgraph P** is defined as: the class `demo:Order`, the class `demo:Customer`, 600 `demo:Order` Individuals and 40 `demo:Customer` Individuals, plus the four `pizza:` classes `Pizza`, `PizzaBase`, `PizzaTopping` and `IceCream` — all of which have first parent `pizza:Food` `[src: CLASS_SPEC, DEMO_CLASSES]`. Total 646 nodes.

**Mode resolution.** `n = 646 > 500`, so line 9 of the heuristic fires and the mode is **grid** regardless of edge composition.

**Grouping** (**LAY-202**):

| Key | Source rule | Members | Count |
|---|---|---|---|
| `demo:Order` | rule 2 — the Individuals' asserted type | 600 Order Individuals | 600 |
| `demo:Customer` | rule 3 — Individuals not in the ABox index | 40 Customer Individuals | 40 |
| `pizza:Food` | rule 5 — first parent | Pizza, PizzaBase, PizzaTopping, IceCream | 4 |
| `owl:Thing` | rule 5 — first parent | demo:Order, demo:Customer | 2 |

**Block sizing** (**LAY-208**):

| Key | `cols` | `rows` | `w` | `h` |
|---|---|---|---|---|
| `demo:Order` | `ceil(sqrt(1080)) = 33` | 19 | `33 × 36 + 24 = 1,212` | `19 × 36 + 46 = 730` |
| `demo:Customer` | `ceil(sqrt(72)) = 9` | 5 | `348` | `226` |
| `pizza:Food` | `ceil(sqrt(7.2)) = 3` | 2 | `132` | `118` |
| `owl:Thing` | `ceil(sqrt(3.6)) = 2` | 1 | `96` | `82` |

**Packing** (**LAY-213**). `area = 1,212 × 730 + 348 × 226 + 132 × 118 + 96 × 82 = 884,760 + 78,648 + 15,576 + 7,872 = 986,856`. `sqrt(area) = 993.4`; `targetW = max(700, 1,589.4) = 1,589.4`.

| Block | Wrap test | `b.x` | `b.y` | `x` after | `rowH` after |
|---|---|---|---|---|---|
| `demo:Order` | `x = 0`, no wrap | 0 | 0 | 1,252 | 730 |
| `demo:Customer` | `1,252 + 348 = 1,600 > 1,589.4` → **wrap** | 0 | `0 + 730 + 48 = 778` | 388 | 226 |
| `pizza:Food` | `388 + 132 = 520 <= 1,589.4` | 388 | 778 | 560 | 226 |
| `owl:Thing` | `560 + 96 = 656 <= 1,589.4` | 560 | 778 | 696 | 226 |

**Node placement.** In the `demo:Order` block, member 0 is at `(0 + 12 + 0 + 18, 0 + 36 + 0 + 18) = (30, 54)`; member 33 — the first of the second row — is at `(30, 90)`; member 599 is at `(12 + (599 mod 33) × 36 + 18, 36 + floor(599/33) × 36 + 18)` = `(30 + 5 × 36, 54 + 18 × 36)` = `(210, 702)`.

**Centring.** The overall bounding box of node centres runs from `(30, 54)` to about `(560 + 12 + 1 × 36 + 18, 778 + 36 + 0 + 18) = (626, 832)`, so `dx ≈ −328`, `dy ≈ −443`. Every node moves by that offset and every one of the four frame records has the same offset added to its origin (**LAY-221**).

**Result.** A 1,212-by-730 block of six hundred orders in the upper area, labelled "Order — 600", with three much smaller labelled blocks beneath it. The reader sees the *shape of the population* immediately — which is the one thing a force layout of the same data could never show.

---

## 9. Determinism

**LAY-228.** Every layout MUST be reproducible: the same Viewport contents, admitted in the same order, with the same Layout mode, pins and Focus set, MUST produce byte-identical positions.

**LAY-229.** No layout MUST consult a random number source. Every place a naive implementation would reach for randomness MUST instead use the specified deterministic substitute:

| Situation | Deterministic substitute | Requirement |
|---|---|---|
| Initial node placement | golden-angle spiral from the seed | [Graph viewport and Budget, §4](20-graph-viewport-and-budget.md#4-initial-placement) |
| Fresh force pre-seed | golden-angle spiral from the origin | **LAY-104** |
| Two nodes exactly coincident in the collision pass | the fixed vector `(0.7, 0.3)` | **LAY-101** |
| Two nodes exactly coincident on a link | the epsilon `+1e-6` on both components | **LAY-82** |
| Ties in crossing reduction | the current position | **LAY-144** |
| Ties in radial root selection | node-map iteration order | **LAY-169** |
| Sibling order in hierarchy | descending local name on push, so ascending on pop | **LAY-136** |
| Member order within a grid block | ascending label | **LAY-209** |
| Collision pair visitation order | ascending IRI | **LAY-97** |

**LAY-230.** Every iteration over a node or edge collection that affects output MUST have a defined order. Hash-map iteration order MUST be insertion order, or the implementation MUST sort explicitly before iterating.

**LAY-231.** No layout MUST depend on wall-clock time, frame timing, elapsed milliseconds or the number of frames rendered. The alpha schedule is per **tick**, not per millisecond (**LAY-110**), so a layout that settles over 239 ticks settles over 239 ticks whether the machine runs at 30 or 144 frames per second.

**LAY-232.** No layout MUST depend on viewport dimensions, device pixel ratio, theme or font metrics. Node width in the hierarchy engine is estimated from character count (**LAY-149**) precisely so that the layout is computable without a drawing surface and does not change when the window is resized.

**LAY-233.** Floating-point operations MUST be performed in the same order on every run. Reordering an accumulation — for example summing repulsion contributions in a different tree traversal order — changes the result in the last bits and breaks byte-identical reproducibility. Implementations that parallelise the force accumulation MUST use a deterministic reduction order; see [Appendix A](#appendix-a--native-stack-mapping-non-normative).

**LAY-234.** Determinism MUST be verified by an automated test that runs each engine twice over the same fixture subgraph and asserts bit-identical positions, and a second test that runs it on two different machines and asserts agreement to within one part in 10^12. See [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md).

**LAY-235.** Determinism is not required **across admission orders**. Admitting the same final node set in a different order legitimately produces a different drawing, because the pre-seed sequence indices differ. What MUST be reproducible is a given *history*, not a given *state*.

---

## 10. Comparison table

**LAY-236.** The following table is normative as a summary of the guarantees stated in each engine's section.

| | **Force-directed** | **Hierarchy** | **Radial** | **Cluster grid** |
|---|---|---|---|---|
| **Complexity per run** | `O(ticks × n log n)`, 70–300 ticks | `O(n log n + m)`, ~20 sweeps | `O(n + m)` | `O(n log n)`, small constant |
| **Complexity per frame** | `O(n log n + m)` while `alpha >= 0.004` | zero | zero | zero |
| **Animates** | yes — the only mode that does | no | no | no |
| **Freeze control** | enabled | disabled | disabled | disabled |
| **Settles before first paint** | yes, via the synchronous warm-up (**LAY-28**) | yes, single pass | yes, single pass | yes, single pass |
| **Best-fit view shape** | mixed neighbourhood, no dominant structure, 15–500 nodes | taxonomy, ≥78 per cent hierarchy edges, ≤400 nodes | single focus, 15–400 nodes, "what is near this?" | population, >300 nodes with >55 per cent `rdf:type`, or >500 nodes of any shape |
| **Position encodes** | connectivity | taxonomic depth (vertical) and sibling order (horizontal) | hop distance from the Focus set (radial) | group membership and alphabetical order |
| **Overlap-free** | yes, after the collision pass, ≥11 units clear | yes within a row, ≥20 units clear; layers 124 apart | yes, after the 3-iteration post-pass | yes, by construction |
| **Crossings** | unbounded, not minimised | heuristically reduced, skipped above 260 per row | unbounded on non-tree edges | unbounded |
| **Stable under one node added** | no — reheats and everything moves | no — layers and orders can all change | no — re-roots if the focus changes | mostly — only the affected block reflows, though the pack can shift |
| **Decorations published** | none | none | ring radii and ring origin | group frames with label and count |
| **Worst-case failure** | a hairball: a single hub with hundreds of leaves relaxes into an indistinguishable disc, and it keeps costing `O(n log n)` per frame to redraw it | a single row hundreds of nodes wide, far wider than any screen, with crossing reduction silently disabled above 260 | a huge outer ring — 2,000 nodes places ring radius near 16,550 world units, so fit-to-view zooms to about 0.05 and every node is a dot | one block per node: a view of many classes with distinct first parents degenerates into hundreds of single-member blocks, which is strictly worse than force |
| **Mitigation** | `auto` prefers hierarchy, radial or grid when the view has a dominant shape | `auto` caps hierarchy at 400 nodes | `auto` caps radial at the point grid takes over, above 500 nodes | `auto` requires `rdf:type` dominance below 500 nodes; above 500, no mode reads well and grid is the least bad |

---

## Appendix A — Native stack mapping (non-normative)

This appendix suggests how the normative algorithms map onto a native Windows 11 stack. Nothing here is binding, and nothing here may change an observable result: every suggestion below must preserve [§9 Determinism](#9-determinism).

### A.1 Running layout off the UI thread

The four engines differ sharply in what threading buys.

**Hierarchy, radial and grid** are single-shot and complete in under 20 ms at their `auto` ceilings. Moving them off-thread buys nothing and costs a synchronisation model. Run them inline.

**Force is the candidate.** Two viable shapes:

*Shape 1 — worker with double-buffered positions.* The simulation owns the node arrays and ticks on a background thread at a fixed 60 Hz. After each tick it publishes positions into a back buffer; the UI thread swaps buffers at the start of each frame. Structural changes are queued from the UI thread and applied at a tick boundary. This keeps the UI responsive during a heavy warm-up and decouples simulation rate from frame rate.

The cost is that **LAY-231** has to be honoured explicitly: the tick rate must be fixed and independent of frame timing, or the alpha schedule becomes wall-clock dependent and the layout stops being reproducible. A fixed-step accumulator is the standard answer.

*Shape 2 — inline with a yield point.* Tick on the UI thread inside the frame callback, exactly as the reference does, but make the synchronous warm-up (**LAY-113**) interruptible: run it in chunks of, say, 25 ticks, yielding between chunks while showing a busy indication. This preserves **LAY-28** — nothing is painted until the warm-up completes — while keeping the window responsive during the 400 ms worst case.

Shape 2 is the simpler correct answer and is recommended unless profiling shows the tick itself exceeding the 6 ms budget of **LAY-120**.

Whichever shape is chosen, **the Viewport must remain single-writer.** Admission and Eviction mutate the node and edge collections; the layout reads them and writes only positions and velocities. Sharing that split requires either a hard handover at tick boundaries or an immutable snapshot of the structure per tick.

### A.2 Incremental versus batch position updates

The renderer needs positions once per frame, not once per tick. Two update strategies:

**Batch.** The layout writes into a contiguous `float` array of positions; the renderer reads the whole array each frame. This is the right default: at 3,000 nodes the array is 24 KB, a memcpy is negligible, and the access pattern is perfectly linear.

**Incremental.** Track which nodes actually moved — after the alpha floor of **LAY-46** most do not — and update only those. This is worth doing only when positions feed a retained-mode scene graph where each update has a per-node cost. For an immediate-mode renderer it is a pessimisation: the dirty-tracking costs more than the copy.

A useful middle path is a **dirty-bounds rectangle**: accumulate the bounding box of all moved nodes during the tick and hand it to the renderer, which can skip redrawing unaffected regions. This pairs well with the observation that after settling, movement is confined to the small region the user last disturbed.

For the three single-shot engines, batch is the only sensible choice — every position changes on every run.

### A.3 SIMD opportunities in the force accumulation

The force tick has three phases with quite different vectorisation potential.

**Repulsion (§5.4) — poor direct SIMD, good restructured SIMD.** The tree descent is control-flow heavy and irregular, so the recursion itself does not vectorise. The productive restructuring is to **batch the leaf contributions**: descend the tree per node, but instead of applying each accepted cell immediately, append `(cx, cy, mass)` to a small buffer; when the buffer is full, process it with four or eight lanes at once. The inner computation — two subtractions, two multiplies, an add, a compare-and-select for the clamp, a reciprocal, two multiplies, two adds — maps cleanly onto AVX2 with a reciprocal approximation plus one Newton step. Expect roughly a 3× improvement on the repulsion phase, which is 60 to 70 per cent of tick time.

A prerequisite is the **structure-of-arrays node layout** suggested in [Graph viewport and Budget, Appendix A](20-graph-viewport-and-budget.md#appendix-a--native-stack-mapping-non-normative): separate `float[] x`, `float[] y`, `float[] vx`, `float[] vy`, `float[] charge`. With an array-of-structures layout the gather cost eats the gain.

**Links (§5.5) — moderate.** Edge processing is a gather-modify-scatter over endpoint indices, and the scatter is the problem: two edges sharing an endpoint create a write conflict between lanes. Two workable approaches: (a) colour the edge set so that no two edges in a batch share an endpoint, then process each colour with full lanes; or (b) accumulate per-edge forces into a flat array and apply them in a separate scalar scatter pass. Option (b) is simpler and still wins, because the force computation — including the `hypot` — is the expensive part and it vectorises completely.

Note that **LAY-233** constrains both: the accumulation order must be fixed. Edge colouring must be computed deterministically from the edge order, and the scatter pass must run in edge order.

**Centring, damping, clamping and integration (§5.6, §5.7) — excellent.** These are pure element-wise passes over the position and velocity arrays with no gathers, no scatters and only one branch — the pin/drag test, which becomes a mask. They vectorise at close to the theoretical lane width. Keep the pinned and dragging flags as a bitmask that can be expanded to a lane mask rather than as per-node booleans tested in a branch.

**Collision resolution (§5.8) — poor.** The spatial hash, the pair ordering by IRI and the early-continue on non-overlap are all control flow. Leave it scalar. If it becomes the bottleneck, the productive change is algorithmic rather than instruction-level: replace the hash map with a sorted cell array built by counting sort, which also improves cache behaviour by an order of magnitude at 3,000 nodes.

**Precision note.** Single precision is sufficient for all four engines — world coordinates stay within a few tens of thousands of units and the collision margins are of order 10 units. But the choice must be made once and held: mixing `float` accumulation with `double` accumulation between platforms breaks **LAY-234**'s cross-machine agreement test.
