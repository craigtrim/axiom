# Graph Viewport and Budget

**Purpose.** This document specifies the bounded graph Viewport: the node and edge records it holds, the admission, Eviction, expansion, collapse and seeding algorithms that govern what enters and leaves it, the hidden-neighbour accounting that keeps it honest, and the complete pointer and keyboard interaction model that drives it.

**Status:** Normative

**Owned prefixes:** `VP`

**Owns:** the Viewport data model, Budget policy, admission and Eviction, expansion and collapse, Focus set and Pin semantics, hidden-neighbour accounting, the graph interaction model (pointer, wheel, context menu, keyboard), and the reported count contract.

**Does not own:** drawing, colour, label placement, edge styling, the minimap, hit-testing geometry and image export — see [Rendering and export](22-graph-rendering-and-export.md). Layout mathematics — see [Layout algorithms](21-layout-algorithms.md). Store structure and adjacency source data — see [Data model and Store](11-data-model-and-store.md).

---

## 1. The bounded viewport principle

This is the central idea of the product's graph, and every other requirement in this document exists to serve it.

The Store may hold twelve thousand Individuals, or twelve million. The Viewport holds at most **Budget** nodes. Not "warns above Budget", not "degrades above Budget" — *holds at most Budget, by construction*. There is exactly one code path by which a node can come to exist in the Viewport, that path counts the cost before it pays it, and it refuses or evicts rather than exceed. A graph built this way has a cost that is a function of the Budget and nothing else. The Store can grow without limit and the graph does not get slower, does not get denser, and does not stop being readable.

The reference build makes this explicit in the source comment on the Viewport singleton: *"Graph viewport. Never holds more than `budget` nodes, by construction."* `[src: G]`

### 1.1 Normative statement

**VP-1.** The Viewport MUST hold at most Budget nodes at every observable moment. There MUST NOT exist any code path — including seeding, expansion, search reveal, table paging, SPARQL result paging or Store reload — that can leave the Viewport holding more than Budget nodes.

**VP-2.** Nothing MUST enter the Viewport that was not explicitly requested by a user action, or by an action taken on the user's behalf and reported to them. There is no background prefetch, no speculative neighbour loading, and no "load the rest while idle".

**VP-3.** The Store MUST NOT be bulk-loaded into the Viewport. Adjacency MUST be computed on demand per node `[src: neighboursOf()]` and MUST NOT be materialised as a whole-Store graph structure held alongside the Viewport.

**VP-4.** Every operation whose cost scales with the Viewport MUST scale with the Viewport size, bounded by Budget, and MUST NOT scale with the Store size. The single exception is per-node adjacency enumeration, which scales with that node's true degree and is separately capped by **VP-31**.

**VP-5.** When the Viewport cannot satisfy a request in full, the shortfall MUST be reported to the user in specific numbers (see [§6.4](#64-user-visible-trace-obligation) and [§13](#13-reported-counts)). Silent truncation is a defect.

### 1.2 Why this makes the graph independent of Store size

Three properties follow from **VP-1** to **VP-4**, and they are the reason the design is worth the discipline it costs.

1. **Frame cost is bounded.** Layout, hit testing and drawing all iterate the Viewport. With at most 3,000 nodes resident, the per-frame cost has a hard ceiling that does not move when the Store is regenerated from twelve thousand Individuals to two hundred thousand. The reference build states this to the user after a Store rebuild: *"The viewport still holds at most N nodes."* `[src: regenerate()]`

2. **Memory is bounded.** The Viewport's footprint is one node record per resident node plus one edge record per edge among them. The Store's footprint is separate and is never duplicated into the Viewport; node records hold IRIs, not entity objects.

3. **Legibility is bounded.** A graph of 1,000 nodes is at the edge of what a person can read. A graph of 100,000 is a smear. Capping admission is not a performance workaround; it is the only way the view stays a *view*. The Budget control is therefore presented as a first-class instrument, not a hidden tuning knob `[src: budgetRange]`.

The corollary the implementation must internalise: **the expensive direction of adjacency is class-to-instance**. Enumerating the instances of a class is what makes an ontology graph explode, and the reference build says so at the point of the enumeration: *"instances of this class — the expensive direction, and the reason the viewport budget exists at all."* `[src: neighboursOf()]`

---

## 2. The viewport node record

### 2.1 Identity and storage

**VP-6.** The Viewport MUST hold nodes in a map keyed by IRI, giving constant-time presence tests, insertion and deletion `[src: G]`. IRI is the sole identity. Two records for the same IRI MUST NOT coexist.

**VP-7.** Every field below MUST be present on every node record, with the stated type, default and invariant `[src: makeNode()]`.

### 2.2 Field table

| Field | Source name | Type | Default at creation | Invariant |
|---|---|---|---|---|
| IRI | `iri` | absolute IRI string | the requested IRI | Immutable. Equals the map key. |
| Kind | `kind` | enum of `class`, `defined`, `individual`, `objectProperty`, `dataProperty` `[src: KIND]` | `kindOf(iri)` `[src: kindOf()]` | Immutable while the node is in view. |
| Label | `label` | string | `labelOf(iri)` `[src: labelOf()]` | Display text only; never used for identity or lookup. MUST be refreshed on rename. |
| Position x | `x` | float, world units | seed x plus golden-angle offset (see [§4](#4-initial-placement)) | MUST be finite. A layout that produces a non-finite coordinate MUST reset it to 0 `[src: layoutForce()]`. |
| Position y | `y` | float, world units | seed y plus golden-angle offset | As above. |
| Velocity x | `vx` | float, world units per tick | `0` | Zero whenever the node is pinned or being dragged `[src: forceTick()]`. |
| Velocity y | `vy` | float, world units per tick | `0` | As above. |
| True degree | `deg` | non-negative integer | `neighboursOf(iri).total` `[src: makeNode()]` | The **uncapped** neighbour count. MUST NOT be clamped by the adjacency cap. See [§10](#10-hidden-neighbours). |
| In-view degree | `shownDeg` | non-negative integer | `0`, then incremented by linking | MUST equal the number of distinct edges in the Viewport incident to this node. `0 <= shownDeg <= deg`. |
| Radius | `r` | float, world units | `nodeRadius(deg, kind)` `[src: nodeRadius()]` | Derived only from true degree and Kind. See [§2.3](#23-the-radius-function). |
| Graph distance | `dist` | non-negative integer | the admitting call's distance, `0` when unspecified | Hop count from the nearest member of the Focus set. MUST only ever decrease (see **VP-40**). |
| Pinned | `pinned` | boolean | `false` | While `true` the node MUST NOT be evicted, MUST NOT be moved by the force simulation, and MUST NOT be re-seeded by a fresh layout. |
| Expanded | `expanded` | boolean | `false` | `true` only when every neighbour outside the view was admitted (see **VP-72**). |
| Touch clock | `touched` | integer | `++clock` | A monotonically increasing logical clock stamped on creation and on every subsequent touch `[src: G]`. Higher means more recently touched. |

**VP-8.** Two further transient fields MAY exist and MUST be treated as non-persistent: `dragging` (boolean, set while a pointer drag is in progress) and `charge` (float, recomputed by the force layout on each run `[src: layoutForce()]`). Neither MUST be relied on by any consumer outside the interaction and layout code.

**VP-9.** The touch clock MUST be a single Viewport-scoped counter incremented before each stamp, never a wall-clock timestamp `[src: G]`. A logical clock gives a total order on touches with no tie-breaking ambiguity and no dependence on timer resolution.

**VP-10.** `dist` MUST be interpreted as *graph distance from the Focus set*, not from the node the user last clicked. Focus members carry `dist = 0` `[src: seedView()]`; a node admitted by expanding a node at distance `d` carries `d + 1` `[src: expandNode()]`.

### 2.3 The radius function

**VP-11.** Node radius MUST be computed as `[src: nodeRadius()]`:

```
nodeRadius(deg, kind):
  1. base ← 5.5   if kind = individual
            7.0   if kind = objectProperty or kind = dataProperty
            8.5   otherwise (class, defined)
  2. return base + min(9, log2(1 + deg) * 1.6)
```

**VP-12.** The degree term MUST use the **true** degree, not the in-view degree. A hub is drawn as a hub the moment it appears, before any of its neighbours are in view.

**VP-13.** The degree term MUST be logarithmic and MUST be capped at `+9` world units. Consequences the implementation MUST preserve:

- `deg = 0` gives `log2(1) × 1.6 = 0`; radius equals base exactly.
- `deg = 1` gives `+1.6`; `deg = 7` gives `+4.8`.
- The cap is reached at `deg = 49` (`log2(50) ≈ 5.644`, `× 1.6 ≈ 9.03`, clamped to 9) and every node above it draws identically.

That last point is intentional. A class with 4,000 instances and a class with 40,000 must not differ visually by a factor of ten, because that difference is unreadable and because the per-node scale is a legibility device, not a data channel. Magnitude is communicated by the hidden-neighbour figure and by the reported counts, not by area.

**VP-14.** Radius bounds follow and MUST hold: the minimum possible radius is `5.5` (an Individual with no neighbours) and the maximum is `17.5` (a class or defined class at or above degree 49).

**VP-15.** Radius MUST be recomputed whenever `deg` is recomputed (see **VP-16**) and MUST NOT otherwise change during the node's lifetime in the Viewport. Radius MUST NOT vary with zoom; zoom scaling is the renderer's concern.

### 2.4 Degree staleness

**VP-16.** `deg` and `r` are captured once, at admission `[src: makeNode()]`. When the Store changes in a way that alters a resident node's true degree — a new subclass asserted, an entity renamed into a different adjacency, a regeneration of demo Individuals — the implementation MUST recompute `deg` and `r` for every resident node, and MUST recompute the aggregate hidden-neighbour figure.

**Status:** specified, not implemented in the reference build. The reference captures `deg` at `makeNode()` and never refreshes it; a class expanded before a subclass is added keeps a stale true degree and under-reports its hidden neighbours until it leaves and re-enters the view.

**VP-17.** The recomputation in **VP-16** MUST be triggered by a Store version change, not polled per frame. The Store exposes a monotonic version counter for exactly this purpose `[src: store]`.

---

## 3. The edge record and edge keying

### 3.1 The record

**VP-18.** An edge record MUST carry exactly these fields `[src: linkNode()]`:

| Field | Type | Meaning |
|---|---|---|
| `a` | IRI | The **subject** endpoint. Direction is semantic, not incidental: `a` is the child, the instance, the domain side. |
| `b` | IRI | The **object** endpoint. |
| `pred` | absolute IRI | The predicate. |
| `label` | string | `localName(pred)` — the predicate's local name, cached at creation for the renderer's convenience `[src: localName()]`. |

**VP-19.** Two further fields are written by the layout pass and MUST NOT be written by the Viewport: `mi` (multiplicity index) and `mn` (multiplicity count) `[src: indexEdges()]`. See [Parallel edge indexing](21-layout-algorithms.md#3-parallel-edge-indexing).

**VP-20.** Edges MUST be held in a map keyed by the composite key of [§3.2](#32-the-composite-key) `[src: G]`, giving constant-time deduplication on insert.

**VP-21.** The Viewport MUST NOT hold an edge whose endpoints are not both resident. Any consumer that iterates edges for layout or drawing MUST additionally filter on both endpoints being present, because eviction paths may transiently violate this `[src: viewEdges()]`.

### 3.2 The composite key

**VP-22.** The edge key MUST be the concatenation of subject IRI, predicate IRI and object IRI, separated by the control character **U+0001** `[src: edgeKey()]`:

```
edgeKey(a, p, b) = a ++ U+0001 ++ p ++ U+0001 ++ b
```

**VP-23.** The separator MUST be a character that cannot occur in an IRI. U+0001 satisfies this: RFC 3987 excludes C0 controls from IRIs. A separator drawn from the printable range (`|`, `:`, `#`) is a defect, because it admits key collisions between distinct triples whose IRIs contain the separator.

**VP-24.** Keying by the ordered triple gives these deduplication semantics, all of which MUST hold:

- The same triple offered twice produces one edge. Re-offering MUST be a no-op, not an update.
- Two different predicates between the same ordered pair produce **two** edges. For example `pizza:Margherita —rdfs:subClassOf→ pizza:NamedPizza` and `pizza:Margherita —rdf:type→ owl:Class` coexist.
- The same predicate in opposite directions between the same pair produces **two** edges, for example `pizza:hasTopping —owl:inverseOf→ pizza:isToppingOf` and its converse.
- Parallel and antiparallel edges MUST be fanned apart by the renderer, not merged by the model. Merging is a display decision and belongs to [Rendering](22-graph-rendering-and-export.md).

### 3.3 Linking a node into the view

**VP-25.** When a node becomes resident, the implementation MUST link it as follows `[src: linkNode()]`:

```
linkNode(n):
  1. list ← neighboursOf(n.iri).list           // capped; see VP-31
  2. for each nb in list:
  3.     other ← nodes[nb.iri]
  4.     if other is absent: continue           // neighbour not in view; no edge
  5.     if nb.dir = "out": (a, b) ← (n.iri, nb.iri)
  6.     else:              (a, b) ← (nb.iri, n.iri)
  7.     k ← edgeKey(a, nb.pred, b)
  8.     if edges contains k: continue          // dedupe: no double counting
  9.     edges[k] ← { a, b, pred: nb.pred, label: localName(nb.pred) }
 10.     n.shownDeg     ← n.shownDeg + 1
 11.     other.shownDeg ← other.shownDeg + 1
```

**VP-26.** In-view degree bookkeeping MUST be maintained in **both** directions on every edge creation (lines 10 and 11) and on every edge deletion. An edge created is `+1` to each endpoint; an edge destroyed is `-1` from each surviving endpoint. This is the single invariant the hidden-neighbour figure rests on, and it is the easiest thing in the whole model to get wrong.

**VP-27.** The `shownDeg` increment MUST be inside the deduplication guard, after line 8, never before it. Incrementing on a duplicate offer inflates in-view degree, deflates the hidden-neighbour count, and silently corrupts the Eviction ordering, which sorts on `shownDeg`.

**VP-28.** When a batch of nodes is admitted together, the implementation MUST insert **all** node records first and only then link each one `[src: addToView()]`. Linking as you insert forms only the edges to previously-resident nodes and loses every edge internal to the batch.

### 3.4 Unlinking a node

**VP-29.** When a node leaves the Viewport, every incident edge MUST be removed and the surviving endpoint decremented `[src: unlinkNode()]`:

```
unlinkNode(u):
  1. for each (k, e) in edges:
  2.     if e.a ≠ u and e.b ≠ u: continue
  3.     delete edges[k]
  4.     other ← nodes[ e.a = u ? e.b : e.a ]
  5.     if other is present: other.shownDeg ← other.shownDeg - 1
```

**VP-30.** The reference implementation scans the whole edge map per removal, giving `O(|E|)` per Eviction and `O(m · |E|)` for a batch of `m` evictions `[src: unlinkNode()]`. An implementation SHOULD maintain a per-node incidence index (IRI to set of edge keys) and unlink in `O(shownDeg)`. The observable behaviour MUST be identical.

**VP-31.** Adjacency enumeration is capped at **4,000** neighbours per node `[src: NEIGHBOUR_CAP]`. The cap applies to the returned neighbour *list* only; the returned *total* MUST be uncapped `[src: neighboursOf()]`. Consequently an edge between two resident nodes can be missed if the enumeration that would have produced it was truncated. The implementation MUST attempt edge formation from **both** endpoints. The reference does this within a batch (**VP-28**) but not across batches, so a class admitted after more than 4,000 of its instances links only to the first 4,000 in its enumeration order.

**Status:** the cross-batch case is specified, not implemented in the reference build.

---

## 4. Initial placement

### 4.1 The algorithm

**VP-32.** A newly created node MUST be placed deterministically, by golden-angle (phyllotaxis) offset from the expansion seed `[src: makeNode()]`:

```
initialPlacement(seedX, seedY):
  1. seq ← the Viewport's node count, taken before this node is inserted
  2. a   ← seq * 2.399963229728653              // golden angle, radians
  3. rad ← 34 * sqrt((seq mod 240) + 1)
  4. x   ← seedX + cos(a) * rad
  5. y   ← seedY + sin(a) * rad
```

Where no seed is supplied, `seedX = seedY = 0` — the world origin `[src: addToView()]`.

### 4.2 Constants

| Constant | Value | Meaning |
|---|---|---|
| Golden angle | `2.399963229728653` rad | π(3 − √5), about 137.5077°. Successive indices land maximally far apart in angle. |
| Radius step | `34` world units | Multiplier on the square-root term. |
| Ring modulus | `240` | Recycles the spiral every 240 nodes, capping the seeded radius at `34 × √240 ≈ 527` world units. |

**VP-33.** The sequence index MUST be the Viewport's node count at the moment of construction, so that nodes admitted in one batch receive consecutive indices and therefore a spread rather than a spike.

**VP-34.** The modulus MUST be applied to the radius term only, never to the angle term. Applying it to the angle would make every 240th node land on top of its predecessor.

### 4.3 Why deterministic, not random

**VP-35.** Initial placement MUST NOT use a random number source. The requirement is not aesthetic; four things depend on it.

1. **Reproducibility.** The same sequence of user actions MUST produce the same picture. Without this, no screenshot comparison, no visual regression test and no bug report with a picture in it is worth anything. See [Layout determinism](21-layout-algorithms.md#9-determinism).
2. **No untangling cost.** A random blob starts with quadratically many overlaps that the simulation must spend its whole alpha schedule resolving. A phyllotaxis spread starts near-uniform, so the simulation spends its budget on structure instead of on separation. The source states the intent: *"a new neighbourhood arrives already spread out instead of as a spike the simulation then has to untangle."* `[src: makeNode()]`
3. **Expansion reads as growth.** Placing the batch around the seed node means the user sees a neighbourhood bloom around the thing they double-clicked, rather than appear across the canvas.
4. **Non-force layouts get a sane fallback.** Hierarchy, radial and grid overwrite positions wholesale, but any node they fail to place — a disconnected node, a node added between layout runs — still has a sensible coordinate.

**VP-36.** The seed MUST be the node that was expanded when the admission came from an expansion `[src: expandNode()]`, and MUST be the origin otherwise.

---

## 5. Admission

Admission is the *only* way a node enters the Viewport. Every other operation — seeding, expansion, reveal, table paging, SPARQL paging, inspector "show instances" — MUST funnel through it.

### 5.1 Contract

```
addToView(iris, opts) -> report

  Inputs
    iris        : ordered sequence of absolute IRIs; may contain duplicates
                  and may contain IRIs already resident
    opts.dist   : non-negative integer, graph distance to assign; default 0
    opts.seed   : resident node record used as the placement seed, or null

  Output (the report)
    added        : integer, count of node records actually created
    evicted      : integer, count of resident nodes removed to make room
    refused      : integer, count of requested-and-absent nodes not admitted
    evictedNames : array of up to 3 labels of evicted nodes, in eviction order

  Postconditions
    node count <= Budget
    added + refused = number of distinct requested IRIs that were not resident
    every newly created node is linked (VP-25) against every resident node
```

### 5.2 Algorithm

**VP-37.** Admission MUST be implemented as follows `[src: addToView()]`:

```
addToView(iris, opts):
   1. dist ← opts.dist ?? 0
   2. seed ← opts.seed ?? null
   3. fresh ← empty ordered list

      // Phase 1 — partition into already-resident and genuinely new
   4. for each u in iris:
   5.     existing ← nodes[u]
   6.     if existing is present:
   7.         existing.touched ← ++clock            // a re-request is a touch
   8.         if dist < existing.dist:
   9.             existing.dist ← dist              // keep the MINIMUM distance ever seen
  10.         continue
  11.     append u to fresh

      // Phase 2 — headroom
  12. room ← Budget - nodeCount
  13. evicted ← 0 ; refused ← 0 ; evictedNames ← []

      // Phase 3 — policy branch
  14. if |fresh| > room:
  15.     if evictMode = "refuse":
  16.         refused ← |fresh| - max(0, room)
  17.         truncate fresh to max(0, room) entries
  18.     else:
  19.         need  ← |fresh| - room
  20.         order ← evictionOrder()                // computed ONCE; see VP-62
  21.         take  ← min(need, |order|)
  22.         for i in 0 .. take-1:
  23.             victim ← order[i]
  24.             unlinkNode(victim.iri)
  25.             delete nodes[victim.iri]
  26.             if |evictedNames| < 3: append victim.label to evictedNames
  27.             evicted ← evicted + 1
  28.         stillOver ← |fresh| - (Budget - nodeCount)
  29.         if stillOver > 0:
  30.             refused ← stillOver
  31.             truncate fresh by stillOver entries, dropping from the tail

      // Phase 4 — create, then link
  32. for each u in fresh:
  33.     nodes[u] ← makeNode(u, dist, seed?.x ?? 0, seed?.y ?? 0)
  34. for each u in fresh:
  35.     linkNode(nodes[u])

      // Phase 5 — wake the simulation, bump the structural revision
  36. alpha    ← max(alpha, 0.9)
  37. revision ← revision + 1
  38. return { added: |fresh|, evicted, refused, evictedNames }
```

### 5.3 Required properties of the algorithm

**VP-38.** Dedupe against present nodes MUST happen *before* headroom is computed — phase 1 before phase 2. Counting already-resident IRIs against the Budget would cause spurious Eviction on a repeated request.

**VP-39.** A re-request of a resident node MUST refresh its touch clock (line 7). This is what makes the `lru` policy meaningful: nodes the user keeps asking for keep their place.

**VP-40.** The **minimum** distance rule (lines 8 and 9) MUST be applied. A node reachable at distance 3 from one focus and distance 1 from another is at distance 1. Distance MUST only ever decrease over a node's lifetime. Taking the maximum, or overwriting unconditionally, would let a node drift into the Eviction candidate set purely because it was re-encountered on a longer path.

**VP-41.** Duplicates *within* the input sequence MUST be filtered. The reference partitions against the residency map only, so an input containing the same absent IRI twice appends it to `fresh` twice, over-counts against the headroom, and creates the node twice — the second creation overwrites the first, losing its already-incremented `shownDeg` and leaving the edge map referring to a record that no longer exists.

**Status:** de-duplication within the input sequence is specified, not implemented in the reference build. Implementations MUST reduce `iris` to a set, preserving first-seen order, before phase 1.

**VP-42.** Eviction victims MUST be selected from the nodes resident *before* phase 4. A freshly admitted node MUST NOT be able to evict a node admitted in the same call, and MUST NOT be able to evict itself.

**VP-43.** Refusal MUST be computed after Eviction (line 28), against the *actual* post-eviction headroom, not against the pre-eviction estimate. When the Eviction candidate set is smaller than `need` — because too much of the Viewport is pinned or in the Focus set — the remainder is refused rather than admitted over Budget. This is the line that makes **VP-1** true.

**VP-44.** Truncation on refusal MUST drop from the tail of `fresh`, preserving the caller's ordering preference. Callers that care which neighbours survive truncation MUST order `iris` accordingly. See **VP-70**.

**VP-45.** The simulation MUST be woken to `alpha >= 0.9` on any admission (line 36) and the structural revision counter MUST be bumped (line 37). The revision counter is what causes the layout to recompute; see [The relayout contract](21-layout-algorithms.md#2-the-relayout-contract).

### 5.4 Removal

**VP-46.** Single-node removal MUST unlink, delete, drop the node from the Focus set, wake the simulation to `alpha >= 0.4`, and bump the revision counter `[src: removeFromView()]`:

```
removeFromView(u):
  1. if nodes[u] is absent: return
  2. unlinkNode(u)
  3. delete nodes[u]
  4. focus.delete(u)
  5. alpha    ← max(alpha, 0.4)
  6. revision ← revision + 1
```

**VP-47.** Removing a node MUST remove it from the Focus set (line 4). A Focus set member that is not resident would make itself un-evictable forever and would distort radial root selection.

**VP-48.** The wake level for removal (`0.4`) MUST be lower than for admission (`0.9`). Removing a node leaves a hole the neighbours close gently; adding a cluster needs real energy to place it.

### 5.5 The reporting obligation

**VP-49.** The report MUST be returned by every admission and MUST be surfaced to the user whenever it is non-trivial. The reference surfaces it as follows `[src: reportView()]`:

- `refused > 0` → warning trace: *"Budget reached at {Budget} nodes. {refused} neighbours of {label} were left out — raise the budget or unpin something."*
- `evicted > 0` and no refusal → warning trace: *"Budget held at {Budget}. Paged out {evicted} node(s) furthest from the focus ({evictedNames joined by ', '}{', …' when evicted > 3}) to make room for {label}."*
- neither → no trace.

**VP-50.** Refusal MUST take precedence over Eviction in the message, because refusal is the condition the user can act on.

**VP-51.** The message MUST name what was lost. "Some nodes were removed" is not an honest report. Up to three labels MUST be listed and the ellipsis MUST be shown when more were removed than were named.

**VP-52.** The report MUST NOT be suppressed on the grounds that it is noisy. The whole bargain of a bounded Viewport is that the user is told when the bound bites.

---

## 6. Eviction

### 6.1 The candidate set

**VP-53.** The Eviction candidate set MUST be every resident node that is **neither pinned nor a member of the Focus set** `[src: evictionOrder()]`:

```
candidates = { n in nodes : not n.pinned and n.iri not in focus }
```

**VP-54.** A pinned node MUST NOT be evicted under any policy, for any reason, at any Budget. Pinning is the user's guarantee; the reference states it in the menu item itself — *"Pin — never evict"* `[src: wireCanvas()]`.

**VP-55.** A Focus set member MUST NOT be evicted. The Focus set is what the current exploration is *about*; evicting it would destroy the frame of reference that `dist` is measured against.

**VP-56.** When the candidate set is empty or smaller than the requirement, the shortfall MUST be refused (**VP-43**). The implementation MUST NOT relax **VP-54** or **VP-55** to satisfy a request.

### 6.2 The three policies

**VP-57.** Three Eviction policies MUST be offered, selectable by the user, with `degree` as the default `[src: G, evictMode]`:

| Policy | User-facing label | Behaviour |
|---|---|---|
| `degree` | "Evict by distance, then degree" | Lexicographic sort; see **VP-58**. Default. |
| `lru` | "Evict least recently touched" | Sort ascending by touch clock. |
| `refuse` | "Refuse and warn" | Evict nothing; refuse the overflow and report it. |

**VP-58.** The `degree` policy MUST sort candidates by this exact comparator, evicting from the front `[src: evictionOrder()]`:

```
compare(a, b):
  1. key1 ← b.dist     - a.dist       // DESCENDING graph distance: furthest goes first
  2. if key1 ≠ 0: return key1
  3. key2 ← a.shownDeg - b.shownDeg   // ASCENDING in-view degree: least connected goes first
  4. if key2 ≠ 0: return key2
  5. return a.touched  - b.touched    // ASCENDING touch clock: least recent goes first
```

The rationale, in order: *furthest from what you are looking at* is the least relevant thing on screen; among equally distant nodes, *the one holding the picture together least* costs least to lose; among equally distant and equally connected nodes, *the one you have not touched in longest* is the one you have stopped caring about.

**VP-59.** The `lru` policy MUST sort candidates ascending by touch clock alone `[src: evictionOrder()]`:

```
compare(a, b) = a.touched - b.touched
```

**VP-60.** The `refuse` policy MUST NOT evict. It MUST compute `refused = |fresh| - max(0, room)`, admit only what fits, and report the shortfall `[src: addToView()]`.

**VP-61.** The sort MUST be stable, or the comparator MUST be total. Both reference comparators fall through to the touch clock, which is unique by construction (**VP-9**), making `degree` and `lru` total and therefore deterministic.

**VP-62.** The Eviction order MUST be computed **once** per admission call and MUST NOT be recomputed as victims are taken `[src: addToView()]`. Recomputing after each removal would let a node's in-view degree fall as its neighbours leave and reorder the remainder mid-sweep, producing a cascade that is neither predictable nor explainable to the user.

### 6.3 Complexity

**VP-63.** Computing the Eviction order MUST cost `O(n log n)` in the Viewport size for the sort plus `O(n)` for candidate collection — at Budget 3,000, a few tens of microseconds. The Eviction sweep itself is dominated by unlinking; see **VP-30** and **VP-204**.

### 6.4 User-visible trace obligation

**VP-64.** Every Eviction MUST produce a user-visible trace naming the count and up to three victims (**VP-49**, **VP-51**). Eviction is the moment the product takes something away from the user without being asked; it MUST NOT happen silently.

**VP-65.** The trace MUST be delivered in a live region so that assistive technology announces it, MUST be dismissible, and MUST auto-dismiss after **6,000 ms** `[src: showToast()]`. See [Component library](41-component-library.md#trace).

**VP-66.** Eviction traces MUST be styled as warnings, not as information. Information traces are used for expansion outcomes, pinning and layout timing `[src: showToast()]`.

---

## 7. Expansion

Expansion is the primary verb of the graph. Everything else is bookkeeping around it.

### 7.1 Contract

```
expandNode(u, limit) -> report or null

  Inputs
    u     : IRI of a resident node
    limit : positive integer cap on how many neighbours to admit,
            or null meaning "as many as the Budget allows"

  Output
    null when u is not resident; otherwise the admission report extended with
      requested   : count of neighbours of u that were NOT already resident
      totalDegree : u's true (uncapped) degree

  Side effects
    u.expanded is set (VP-72); u.touched is refreshed
```

### 7.2 Algorithm

**VP-67.** Expansion MUST be implemented as follows `[src: expandNode()]`:

```
expandNode(u, limit):
  1. n ← nodes[u]
  2. if n is absent: return null
  3. (list, total) ← neighboursOf(u)                        // list capped at 4000
  4. wanted ← [ x.iri for x in list if x.iri not in nodes ] // absent neighbours only
  5. cap   ← limit ?? Budget
  6. slice ← first cap entries of wanted
  7. report ← addToView(slice, { dist: n.dist + 1, seed: n })
  8. n.expanded ← (|wanted| = |slice|) and (report.refused = 0)
  9. n.touched  ← ++clock
 10. report.requested   ← |wanted|
 11. report.totalDegree ← total
 12. return report
```

### 7.3 Required properties

**VP-68.** Enumeration MUST be on demand, per node, and MUST NOT consult a precomputed whole-Store adjacency structure (**VP-3**).

**VP-69.** Filtering to absent neighbours (line 4) MUST happen before the limit is applied (line 6). Applying the limit first would waste the allowance on nodes already on screen: expanding a node whose first twenty neighbours are all resident would admit nothing and appear broken.

**VP-70.** `wanted` MUST preserve the enumeration order of the adjacency function, which is deterministic and structural: parents, children, restriction fillers and equivalents, disjoints, domain, range, inverse, asserted types, reverse restrictions, then instances `[src: neighboursOf()]`. Because truncation drops from the tail (**VP-44**), this ordering means *structural* neighbours survive truncation and *instances* are the first thing sacrificed — the correct priority for an ontology view.

**VP-71.** Admitted neighbours MUST receive `dist = n.dist + 1` and MUST be seeded at the expanded node's position (line 7). Distance assignment is what makes the `degree` Eviction policy work: the frontier of the exploration is exactly the set of highest-distance nodes.

**VP-72.** The `expanded` flag MUST be set to `true` **only when nothing was held back** (line 8) — that is, only when the limit did not truncate *and* the Budget did not refuse. Both conditions MUST be tested. A node marked expanded is a promise to the user that there is nothing more to see there; an expansion that hit a cap has not earned that promise.

**VP-73.** `expanded` MUST be cleared by collapse (**VP-82**) and MUST be treated as advisory by the renderer: it governs the presence of a "more neighbours" affordance, never the model.

**VP-74.** A node whose true degree exceeds the adjacency cap of 4,000 can never be fully expanded and MUST NOT be marked expanded. Since the neighbour list is capped and `wanted` derives from it, the implementation MUST additionally require `total <= 4000` before setting `expanded`.

**Status:** specified, not implemented in the reference build. The reference compares `|wanted|` to `|slice|`, both derived from the already-capped list, so a node with 10,000 neighbours whose first 4,000 all fit is marked expanded despite 6,000 neighbours remaining. The hidden-neighbour figure ([§10](#10-hidden-neighbours)) still reports them honestly, so the defect is confined to the flag.

**VP-75.** Expansion MUST report "nothing to do" distinctly from "something was held back". When `requested = 0` the reference emits an information trace — *"{label} has no further neighbours outside the view."* — instead of the admission report `[src: wireCanvas()]`.

### 7.4 Bounded expansion

**VP-76.** A bounded expansion of exactly **20** neighbours MUST be available from the context menu, as a low-commitment probe of a hub `[src: wireCanvas()]`.

**VP-77.** Callers MUST supply a limit when expanding from a context where an unbounded expansion would evict most of the view. The reference supplies limits at these sites:

| Site | Limit | Source |
|---|---|---|
| Context menu, "Expand 20 only" | `20` | `[src: wireCanvas()]` |
| Reveal in graph | `min(80, Budget)` | `[src: revealInGraph()]` |
| Seeding, per seed | `max(1, floor(Budget / max(1, seedCount)))` | `[src: seedView()]` |
| Boot-time demonstration expansion of `pizza:NamedPizza` | `30` | `[src: init()]` |
| Double-click, context menu "Expand neighbours", Enter key | none — the Budget is the limit | `[src: wireCanvas()]` |

---

## 8. Collapse

### 8.1 Contract

```
collapseNode(u) -> integer

  Input   : IRI of a resident node
  Output  : count of neighbours removed
  Effect  : u.expanded is cleared
```

### 8.2 Algorithm

**VP-78.** Collapse MUST be implemented as follows `[src: collapseNode()]`:

```
collapseNode(u):
  1. n ← nodes[u]
  2. if n is absent: return 0
  3. removed ← 0
  4. keep ← { u } ∪ focus
  5. for each edge e in a SNAPSHOT of the edge map:
  6.     other ← e.b if e.a = u ; e.a if e.b = u ; else null
  7.     if other is null or other in keep: continue
  8.     on ← nodes[other]
  9.     if on is absent or on.pinned: continue
 10.     if on.shownDeg <= 1:
 11.         removeFromView(other)
 12.         removed ← removed + 1
 13. n.expanded ← false
 14. return removed
```

### 8.3 Required properties

**VP-79.** A neighbour qualifies for removal **only** when all four hold: its in-view degree is at most 1, it is not pinned, it is not in the Focus set, and it is not the collapsed node itself.

**VP-80.** The in-view degree test is what makes collapse safe. A neighbour with in-view degree 2 or more is load-bearing: it connects the collapsed node to something else the user has on screen, and removing it would tear a hole in a path the user built deliberately. The user-facing explanation of the empty case says exactly this: *"Nothing to collapse — every neighbour is shared or pinned."* `[src: wireCanvas()]`

**VP-81.** The edge map MUST be snapshotted before iteration (line 5), because removal mutates it. Iterating a live map while deleting from it is undefined in most collection implementations and skips entries in all of them.

**VP-82.** Collapse MUST clear `expanded` (line 13) even when nothing was removed, because the node's neighbourhood is no longer known to be complete.

**VP-83.** Collapse MUST report its outcome. The reference emits an information trace in both cases `[src: wireCanvas()]`:

- `removed > 0` → *"Collapsed {removed} leaf neighbour(s) of {label}."*
- `removed = 0` → *"Nothing to collapse — every neighbour is shared or pinned."*

**VP-84.** Collapse MUST NOT cascade. Removing a leaf may drop a second node's in-view degree to 1, but that node MUST NOT then be removed in the same pass. A single collapse removes exactly the leaves that were leaves when it started; a second collapse of the same node peels the next layer. Predictability beats thoroughness here.

**VP-85.** Collapse cost is `O(|E|)` for the scan plus the cost of each removal (**VP-30**). With an incidence index it is `O(shownDeg · log |E|)`.

---

## 9. Seeding and focus

### 9.1 The Focus set

**VP-86.** The Focus set MUST be a set of IRIs, MUST contain only resident nodes (**VP-47**), and MUST govern three things: Eviction immunity (**VP-55**), the origin for graph distance (**VP-10**), and radial layout root selection (see [Radial tree](21-layout-algorithms.md#7-radial-tree)).

**VP-87.** The Focus set MUST be settable only by seeding ([§9.2](#92-seeding)) and by reveal ([§9.3](#93-reveal-in-graph)). Selection MUST NOT alter it; a user may click twenty nodes while exploring without changing what the exploration is about.

### 9.2 Seeding

```
seedView(iris, opts) -> report

  opts.replace : boolean, default TRUE  — clear the Viewport first
  opts.expand  : boolean, default TRUE  — expand each seed after admission
```

**VP-88.** Seeding MUST be implemented as follows `[src: seedView()]`:

```
seedView(iris, opts):
  1. if opts.replace ≠ false:
  2.     nodes.clear() ; edges.clear() ; focus.clear()
  3. for each u in iris: focus.add(u)
  4. rep ← addToView(iris, { dist: 0 })
  5. if opts.expand ≠ false:
  6.     perSeed ← max(1, floor(Budget / max(1, |iris|)))
  7.     for each u in the first 12 entries of iris:
  8.         expandNode(u, perSeed)
  9. relayout({ fresh: true })
 10. fitView()
 11. return rep
```

**VP-89.** Replace MUST be the default and MUST clear nodes, edges **and** the Focus set together (line 2). Clearing nodes without clearing focus leaves phantom focus members (**VP-47**).

**VP-90.** Add mode (`replace: false`) MUST preserve existing residents and MUST union the new seeds into the Focus set. Seeds admitted in add mode still carry `dist = 0`, which by the minimum rule (**VP-40**) can only lower existing distances, never raise them.

**VP-91.** Every seed MUST be assigned `dist = 0` (line 4), making the Focus set the distance origin by construction.

**VP-92.** The per-seed expansion budget MUST be `max(1, floor(Budget / max(1, seedCount)))` (line 6). At the default Budget of 1,000: one seed expands up to 1,000 neighbours; ten seeds expand up to 100 each; 3,000 seeds still get 1 each rather than 0. Dividing the allowance is what stops the first seed consuming the whole Viewport and leaving the rest of the Focus set bare.

**VP-93.** At most the **first 12** seeds MUST be expanded (line 7). Beyond a dozen focal points the expansions are individually too small to be informative, and the cost of enumerating adjacency for hundreds of seeds is real. Seeds past the twelfth are admitted but not expanded.

**VP-94.** Seeding MUST trigger a **fresh** layout (line 9) — full re-seed and settle, not an incremental nudge. See [The relayout contract](21-layout-algorithms.md#2-the-relayout-contract).

**VP-95.** Seeding MUST fit the view (line 10). This is the fit-to-view obligation: an operation that replaces the contents of the Viewport MUST leave those contents visible. A user who seeds and sees an empty canvas because the camera is still parked over the previous exploration has been handed a bug.

**VP-96.** Every operation that replaces the Viewport contents wholesale MUST fit the view. In the reference this is seeding, layout mode change, manual re-layout, splitter drag completion and window resize `[src: seedView(), wireSplitter(), init()]`.

### 9.3 Reveal in graph

**VP-97.** Reveal MUST bring an entity into view and centre the camera on it, without disturbing an exploration already in progress `[src: revealInGraph()]`:

```
revealInGraph(u):
  1. if u is not resident:
  2.     rep ← addToView([u], { dist: 0 })
  3.     focus.add(u)
  4.     reportView(rep, labelOf(u))
  5.     expandNode(u, min(80, Budget))
  6.     fitView()
  7. selected ← u
  8. n ← nodes[u]
  9. if n is present:
 10.     view.k ← max(view.k, 0.8)
 11.     view.x ← canvasWidth  / 2 - n.x * view.k
 12.     view.y ← canvasHeight / 2 - n.y * view.k
```

**VP-98.** Reveal MUST be idempotent for a resident node: it MUST NOT re-expand, MUST NOT re-add to the Focus set, and MUST NOT re-fit. Only the camera moves — lines 7 to 12.

**VP-99.** Reveal MUST admit in **add** mode, never replace. Revealing an entity from the class tree or the inspector is a "show me this too" gesture, not "start again here". The "Focus here" context-menu item is the replace gesture, and it is labelled as such — *"Focus here / reseeds view"* `[src: wireCanvas()]`.

**VP-100.** Reveal MUST raise zoom to at least `0.8` but MUST NOT lower it (line 10). A user zoomed in to 2.5× who reveals a node expects to arrive at 2.5×, not to be zoomed out.

**VP-101.** Reveal MUST centre the node exactly, in screen coordinates, using the world-to-screen relation of **VP-127** (lines 11 and 12).

### 9.4 Clearing

**VP-102.** A Clear action MUST empty nodes, edges, the Focus set and the selection, and MUST bump the revision counter `[src: gClear]`. Clear MUST NOT reset the Budget, the Eviction policy, the Layout mode or the camera.

---

## 10. Hidden neighbours

### 10.1 Definition

**VP-103.** A node's hidden-neighbour count MUST be defined as `[src: hiddenNeighbours()]`:

```
hiddenNeighbours(n) = max(0, n.deg - n.shownDeg)
```

**VP-104.** The aggregate MUST be the sum over all resident nodes `[src: totalHidden()]`:

```
totalHidden() = sum of hiddenNeighbours(n) over all n in nodes
```

**VP-105.** The floor at zero MUST be retained. It is defensive: it guarantees the user is never shown a negative count if a bookkeeping invariant is violated. The floor MUST NOT be treated as licence to violate **VP-26**.

**VP-106.** The aggregate counts (node, absent neighbour) pairs. It cannot double-count, because an edge exists only when both endpoints are resident, and a resident neighbour is by definition not hidden. The user-facing gloss MUST be phrased in those terms; the reference legend says *"+n = neighbours held back by the budget"* `[src: renderLegend()]`.

### 10.2 The adjacency cap must not corrupt it

**VP-107.** Adjacency enumeration MUST return both a capped list and an **uncapped** total `[src: neighboursOf()]`:

```
add(target, pred, dir):
  1. total ← total + 1                       // always counted
  2. if |out| < 4000: append to out           // only the first 4000 are materialised
```

**VP-108.** `deg` MUST be taken from the uncapped total, never from the list length `[src: makeNode()]`. This is the single most important line in the hidden-neighbour contract. If `deg` were `min(total, 4000)`, then `pizza:Pizza` with twelve thousand generated Individuals would report at most 4,000 hidden neighbours — and the user would be told a number that is not true.

**VP-109.** Adjacency enumeration MUST NOT emit the same `(target, predicate, direction)` triple more than once, and the uncapped total MUST count **distinct** triples. `deg` is compared against `shownDeg`, which is a count of distinct edges (**VP-27**); if the total counts duplicates and the edge count does not, the difference is not "hidden neighbours" but "enumeration noise", and the user is shown a number that means nothing.

The reference increments the total on every emission, including duplicates. This bites wherever the same predicate reaches the same target twice. For example `pizza:Margherita` carries both `hasTopping some MozzarellaTopping` and `hasTopping only (MozzarellaTopping, TomatoTopping)` `[src: NAMED_PIZZAS, buildTBox()]`; the two restrictions emit the pair `(MozzarellaTopping, hasTopping, out)` twice, so the class's total is 6 where its distinct neighbour count is 4. With all four neighbours resident, `hiddenNeighbours` reports **2** when the true answer is **0**.

Implementations MUST de-duplicate inside the enumerator, on the triple, before incrementing the total.

**Status:** specified, not implemented in the reference build.

**VP-110.** The cap MUST be a materialisation cap only. It bounds the memory and time cost of enumerating one node's neighbours. It MUST NOT bound, round, clamp or otherwise influence any figure reported to the user.

**VP-111.** The cap value MUST be **4,000** `[src: NEIGHBOUR_CAP]`. It sits above any attainable Budget (maximum 3,000), so it never truncates a list the Budget would have admitted in full; and it is small enough that enumerating a two-hundred-thousand-instance class costs 4,000 list appends rather than 200,000.

### 10.3 Surfacing

**VP-112.** The hidden-neighbour count MUST be surfaced **per node**. The reference surfaces it in the hover tooltip — *"{label} — {Kind} · {n} neighbours hidden"* — and omits the clause entirely when the count is zero `[src: wireCanvas()]`. The renderer additionally draws a per-node badge; that is [Rendering](22-graph-rendering-and-export.md)'s concern.

**VP-113.** The aggregate MUST be surfaced continuously in the Budget panel, labelled "Hidden neighbours" `[src: updateBudgetUI()]`.

**VP-114.** The aggregate MUST be included in the exported image caption. The reference writes *"viewport budget {Budget} · {totalHidden} neighbours held back"* into the export footer `[src: totalHidden()]`. An exported picture that does not say what it left out is a misleading picture.

**VP-115.** The aggregate MUST be recomputed on every reported-count update rather than cached, unless a cache is invalidated on every node and edge mutation. At Budget 3,000 the sum is a 3,000-element traversal — tens of microseconds — and a stale honesty figure is worse than no figure.

---

## 11. Budget control

### 11.1 Range and default

**VP-116.** The Budget MUST be user-adjustable over the closed range **100 to 3,000**, in steps of **100**, defaulting to **1,000** `[src: budgetRange, G]`.

| Property | Value |
|---|---|
| Minimum | 100 |
| Maximum | 3,000 |
| Step | 100 |
| Default | 1,000 |

**VP-117.** The control MUST be a continuous slider with a live numeric readout, MUST be labelled "Viewport budget", and MUST apply on every input event, not on release `[src: budgetRange]`. The user is tuning a live picture; a value that only lands on release breaks the feedback loop.

**VP-118.** The control MUST be accompanied by an occupancy meter showing `min(100, round(nodeCount / Budget × 100))` per cent, with a distinct state at 75 per cent or above and another at 98 per cent or above `[src: updateBudgetUI()]`.

**VP-119.** The Budget MUST NOT be raised implicitly by any operation. Only the user raises the Budget.

### 11.2 Lowering the Budget below the current node count

**VP-120.** When the Budget is lowered below the current node count, the overflow MUST be evicted **immediately**, in the same interaction, using the active Eviction policy's ordering `[src: budgetRange]`:

```
onBudgetChange(value):
  1. Budget ← value
  2. update the numeric readout
  3. if nodeCount > Budget:
  4.     order ← evictionOrder()
  5.     over  ← nodeCount - Budget
  6.     take  ← min(over, |order|)
  7.     for i in 0 .. take-1:
  8.         unlinkNode(order[i].iri)
  9.         delete nodes[order[i].iri]
 10.     trace warning: "Budget lowered to {Budget}. Paged out {take} nodes."
 11. updateBudgetUI()
```

**VP-121.** The Eviction on lowering MUST report the count in a warning trace (line 10). Lowering the Budget is a user action with a consequence the user may not have predicted, and the consequence MUST be named.

**VP-122.** The Eviction on lowering MUST respect pins and the Focus set. If pinned and focused nodes alone exceed the new Budget, the Viewport MUST be left above Budget and the implementation MUST report the residual overflow.

**Status:** the residual-overflow report is specified, not implemented in the reference build. The reference reports the number paged out but does not say that the remainder stayed because it was pinned or focused. Implementations MUST add: *"{residual} pinned or focused nodes remain above the budget."*

**VP-123.** The Eviction on lowering MUST bump the revision counter so the layout recomputes. The reference omits this; the layout signature includes the node count, so recomputation happens anyway `[src: layoutKey()]`. Implementations MUST NOT rely on that coincidence and MUST bump the revision explicitly.

**VP-124.** Lowering the Budget MUST NOT re-fit the view. The camera is the user's; a Budget change is not a navigation.

**VP-125.** Raising the Budget MUST admit nothing. It creates headroom; it does not fill it. Nothing enters that was not requested (**VP-2**).

### 11.3 Eviction policy control

**VP-126.** The Eviction policy MUST be selectable from a labelled control reading "On overflow", offering the three options of **VP-57** and applying immediately on change `[src: evictMode]`. Changing the policy MUST NOT itself evict anything.

---

## 12. The interaction model

This section is owned in full by this document. Hit-testing *geometry* — how a screen point maps to a node — belongs to [Rendering](22-graph-rendering-and-export.md#hit-testing); everything here treats "the node under the pointer, or none" as a primitive named `hitTest(sx, sy)` `[src: hitTest()]`.

### 12.1 Camera model

**VP-127.** The camera MUST be three scalars: `x` and `y` (screen-space translation, in pixels) and `k` (uniform scale) `[src: G]`. The world-to-screen transform MUST be:

```
screen.x = world.x * k + view.x
screen.y = world.y * k + view.y
```

and its inverse `[src: hitTest()]`:

```
world.x = (screen.x - view.x) / k
world.y = (screen.y - view.y) / k
```

**VP-128.** There MUST be no rotation and no skew. Scale MUST be uniform in both axes.

**VP-129.** Camera state MUST NOT be part of the layout signature and MUST NOT trigger relayout `[src: layoutKey()]`. Panning and zooming are free.

### 12.2 Pointer pan

**VP-130.** A primary-button press on empty canvas MUST begin a pan `[src: wireCanvas()]`:

```
onPointerDown(ev):
  1. closeMenus()
  2. p ← pointer position in canvas-local coordinates
  3. n ← hitTest(p.x, p.y)
  4. moved ← false ; last ← p
  5. if n is present: dragNode ← n ; n.dragging ← true
  6. else:            panning  ← true ; set the panning cursor
```

**VP-131.** Pan MUST translate the camera by the raw screen delta, **not** divided by the scale `[src: wireCanvas()]`:

```
onPointerMove during pan:
  1. moved  ← true
  2. view.x ← view.x + (p.x - last.x)
  3. view.y ← view.y + (p.y - last.y)
  4. last   ← p
```

This is what makes the content stay glued to the pointer at every zoom level.

**VP-132.** Pointer move MUST be observed at the window level, not the canvas level, so a drag that leaves the canvas continues and a release outside the canvas still terminates it `[src: wireCanvas()]`.

**VP-133.** Pan MUST have no bounds. The user may pan the content entirely off screen; fit-to-view (**VP-170**) is the recovery.

**VP-134.** A press and release on empty canvas with no intervening movement MUST clear the selection `[src: wireCanvas()]`.

**VP-135.** The canvas MUST show a distinct cursor while panning and MUST restore it on release `[src: wireCanvas()]`.

### 12.3 Wheel zoom

**VP-136.** Wheel zoom MUST be anchored at the cursor: the world point under the cursor MUST remain under the cursor `[src: wireCanvas()]`:

```
onWheel(ev):
  1. suppress the default page scroll
  2. (mx, my) ← cursor position in canvas-local coordinates
  3. k0 ← view.k
  4. factor ← 1.12      when ev.deltaY < 0   (scroll up = zoom in)
              1 / 1.12  otherwise
  5. k1 ← clamp(k0 * factor, 0.08, 4)
  6. view.x ← mx - (mx - view.x) * (k1 / k0)
  7. view.y ← my - (my - view.y) * (k1 / k0)
  8. view.k ← k1
  9. updateBudgetUI()          // refresh the zoom readout
```

**VP-137.** The zoom factor MUST be **1.12** per wheel notch, and zoom-out MUST use the exact reciprocal `1 / 1.12`, so that a notch out exactly undoes a notch in `[src: wireCanvas()]`. Using `0.88` instead of the reciprocal makes zoom non-reversible and is a defect.

**VP-138.** Interactive zoom MUST be clamped to the closed range **[0.08, 4]** `[src: wireCanvas()]`. At 0.08 a 3,000-node view fits comfortably; at 4 a single node fills a quarter of the canvas.

**VP-139.** The anchoring MUST be derived, not approximated. Lines 6 and 7 are the algebraic solution of "the world point under the cursor maps to the same screen point after scaling".

**VP-140.** Zoom MUST NOT be accumulated per pixel of wheel delta. The sign of the delta MUST select the direction and its magnitude MUST be ignored, so that wheels and precision trackpads behave identically `[src: wireCanvas()]`.

**VP-141.** Toolbar zoom buttons MUST use factor **1.25** and its reciprocal, anchored at the canvas centre rather than the cursor, and MUST honour the same clamp `[src: gZoomIn, gZoomOut]`.

**VP-142.** The zoom readout MUST be updated on every zoom change (line 9).

### 12.4 Node drag

**VP-143.** A primary-button press on a node MUST begin a node drag, and the drag MUST move the node in **world** units — the screen delta divided by the scale `[src: wireCanvas()]`:

```
onPointerMove during node drag:
  1. moved ← true
  2. dragNode.x  ← dragNode.x + (p.x - last.x) / view.k
  3. dragNode.y  ← dragNode.y + (p.y - last.y) / view.k
  4. dragNode.vx ← 0 ; dragNode.vy ← 0        // velocity suppression
  5. alpha ← max(alpha, 0.35)                  // wake neighbours to follow
  6. last ← p
```

**VP-144.** Velocity MUST be zeroed on every drag frame (line 4), **and** the force integrator MUST skip integration for any node whose `dragging` flag is set `[src: forceTick()]`. Both are required: zeroing alone still lets the tick accumulate a force and apply it, producing a node that fights the pointer.

**VP-145.** The collision pass MUST also skip dragged nodes — a dragged node MUST push others aside and MUST NOT be pushed `[src: resolveCollisions()]`.

**VP-146.** Dragging MUST wake the simulation to `alpha >= 0.35` (line 5), so the neighbourhood reflows around the moved node. This is a lower wake than admission (0.9) or removal (0.4), because a drag is a local perturbation.

**VP-147.** Dragging MUST NOT pin the node. On release the node resumes simulation from where it was left. Pinning is an explicit, separate act (**VP-159** item 5).

**VP-148.** A press and release on a node with no intervening movement MUST select that node — a click, not a drag `[src: wireCanvas()]`. The distinction MUST be made by "did any move event occur", not by a distance threshold.

**VP-149.** On release the `dragging` flag MUST be cleared and the reported counts MUST be refreshed `[src: wireCanvas()]`.

### 12.5 Hover

**VP-150.** Hover MUST track the node under the pointer and MUST update only on a change of identity, not on every move event `[src: wireCanvas()]`:

```
onPointerMove with no drag and no pan in progress:
  1. if the event target is not the canvas: return
  2. n   ← hitTest(p.x, p.y)
  3. iri ← n.iri when n is present, else null
  4. if iri = hovered: return                  // no work on unchanged hover
  5. hovered ← iri
  6. cursor  ← pointer cursor when n is present, else the default
  7. tooltip ← "" when n is absent, otherwise
       labelOf(n.iri) + " — " + kindLabel(n.kind)
       + (hiddenNeighbours(n) > 0
            ? " · " + format(hiddenNeighbours(n)) + " neighbours hidden"
            : "")
```

**VP-151.** The hovered node's identity MUST be published to the renderer, which is responsible for neighbour emphasis: the hovered node, its incident edges and its in-view neighbours drawn emphasised, everything else de-emphasised. The *selection* of what to emphasise is specified here; the *appearance* belongs to [Rendering](22-graph-rendering-and-export.md).

**VP-152.** The tooltip contract MUST be exactly the three parts of line 7: label, Kind label, and the hidden-neighbour clause **only when non-zero**. Showing "0 neighbours hidden" is noise; omitting the clause when it is non-zero is dishonest.

**VP-153.** Hover MUST NOT mutate the model: no touch clock update, no selection change, no revision bump. Hovering is free and MUST remain so at 1,000 nodes.

**VP-154.** Hover emphasis MUST clear when the pointer leaves the canvas.

### 12.6 Click and double-click

**VP-155.** A click on a node MUST select it, which MUST synchronise the class tree, the inspector and the status-bar selection readout `[src: selectEntity()]`. Selection MUST NOT alter the Focus set (**VP-87**), MUST NOT expand, and MUST NOT move the camera.

**VP-156.** A double-click on a node MUST perform an unbounded expansion and report `[src: wireCanvas()]`:

```
onDoubleClick(ev):
  1. n ← hitTest(...)
  2. if n is absent: return
  3. rep ← expandNode(n.iri)                    // no limit: the Budget is the limit
  4. if rep.requested = 0:
  5.     trace info: "{label} has no further neighbours outside the view."
  6. else:
  7.     reportView(rep, labelOf(n.iri))
  8. updateBudgetUI()
```

**VP-157.** A double-click on empty canvas MUST do nothing. It MUST NOT fit, clear or reset.

### 12.7 Context menu

**VP-158.** A secondary-button press MUST suppress the platform menu, select the node under the pointer, and open the graph context menu at the pointer `[src: wireCanvas()]`. A secondary press on empty canvas MUST open nothing.

**VP-159.** The menu MUST carry a non-interactive header showing the node's label, and MUST contain exactly these items, in this order, with these enablement rules `[src: wireCanvas()]`:

| # | Item | Trailing hint | Enabled when | Action |
|---|---|---|---|---|
| 1 | Expand neighbours | `+{hidden}` when enabled, `none` when disabled | `hiddenNeighbours(n) > 0` | `expandNode(u)`, then report |
| 2 | Expand 20 only | — | `hiddenNeighbours(n) > 0` | `expandNode(u, 20)`, then report |
| 3 | Collapse neighbourhood | — | always | `collapseNode(u)`, then report (**VP-83**) |
| — | *separator* | | | |
| 4 | Focus here | `reseeds view` | always | `seedView([u])` — replace mode |
| 5 | Pin — never evict / Unpin | — | always | toggle `n.pinned`, then trace |
| 6 | Remove from view | `Del` | always | `removeFromView(u)` |

**VP-160.** Items 1 and 2 MUST be disabled when the node has no hidden neighbours, and item 1's hint MUST read `none` in that state. Offering an expansion that provably cannot add anything is a lie in the interface.

**VP-161.** Item 3 MUST remain enabled unconditionally, because whether anything qualifies for collapse cannot be known without running the in-view-degree test over every neighbour, and running it on every menu open is wasted work. The empty case is handled by the trace (**VP-83**).

**VP-162.** Item 4 MUST be labelled with its consequence. Replacing the Viewport is destructive of the user's exploration and MUST NOT be offered as an unqualified verb.

**VP-163.** Item 5's label MUST reflect the current state and MUST state the consequence on the pin side — *"Pin — never evict"*. Its action MUST emit a confirming trace: *"{label} pinned — it will not be evicted."* or *"{label} unpinned."* `[src: wireCanvas()]`

**VP-164.** Item 6 MUST advertise its keyboard equivalent.

**VP-165.** The menu MUST be clamped inside the window: `left = min(x, windowWidth - menuWidth - 8)` and `top = min(y, windowHeight - menuHeight - 8)` `[src: openMenu()]`.

**VP-166.** The menu MUST close on any item activation, on Escape, on a press anywhere outside it, and on any pointer-down on the canvas `[src: closeMenus(), wireCanvas()]`.

**VP-167.** Every item MUST re-read the node from the Viewport at activation time and MUST no-op if it is gone `[src: wireCanvas()]`. A node can be evicted between opening the menu and clicking it.

**VP-168.** Every item MUST refresh the reported counts after acting.

### 12.8 Keyboard model

**VP-169.** The canvas MUST be focusable and MUST carry an accessible name describing what it is and how to populate it `[src: canvas]`.

**VP-170.** Canvas-scoped bindings, active when the canvas has focus `[src: wireCanvas()]`:

| Key | Action | Precondition |
|---|---|---|
| `F` / `f` | Fit to view, then refresh counts | always |
| `L` / `l` | Re-run layout fresh, then fit, then refresh counts | always |
| `Enter` | Expand the selected node without a limit, then report | a node is selected |
| `Delete` | Remove the selected node from the Viewport | a node is selected |
| `Backspace` | Remove the selected node from the Viewport | a node is selected |

**VP-171.** Application-scoped bindings, active whenever focus is not in a text field `[src: wire()]`:

| Key | Action |
|---|---|
| `Escape` | Close any open menu and any open dialogue |
| `Ctrl`/`Cmd` + `F` | Focus and select the global search field |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `S` | Save |
| `F2` | Rename the selection |
| `Delete` | Delete the selected entity from the Store — **only when that entity is not resident in the Viewport** |

**VP-172.** The `Delete` collision MUST be resolved by residency, exactly as the reference does: if the selected entity is in the Viewport, `Delete` removes it from the *view*; if it is not, `Delete` deletes it from the *Store* `[src: wire(), wireCanvas()]`. This disambiguation MUST be preserved, because the two actions differ in destructiveness by an order of magnitude and MUST NOT be reachable by the same keystroke in the same context.

**VP-173.** Text-entry contexts MUST suppress all single-key bindings. The reference tests whether the focused element is a text input, a text area or a select, and returns early `[src: wire()]`.

**VP-174.** `Escape` MUST be processed **before** the text-entry suppression, so that it closes a dialogue from inside that dialogue's own fields `[src: wire()]`.

**VP-175.** Modified bindings that would otherwise invoke a platform default — `Ctrl+F`, `Ctrl+S` — MUST suppress that default `[src: wire()]`.

**VP-176.** The following graph actions MUST have keyboard equivalents: zoom in, zoom out, pan, cycle Layout mode, pin/unpin the selection, collapse the selection, and move the selection to the next or previous node.

**Status:** specified, not implemented in the reference build. Implementations MUST provide at minimum `+` and `-` for zoom, arrow keys for pan by 40 world units, `P` for pin toggle, and `C` for collapse.

### 12.9 Focus order

**VP-177.** Tab order within the graph Surface MUST be: canvas, zoom in, zoom out, fit, layout mode selector, re-run layout, freeze simulation, export, clear, Budget slider, Eviction policy selector `[src: graph]`.

**VP-178.** The canvas MUST precede the toolbar in tab order. The canvas is the object of the work; the toolbar acts on it.

**VP-179.** Decorative Surfaces — the minimap and the legend — MUST NOT be focusable `[src: graph]`.

**VP-180.** The trace Surface's dismiss control MUST be focusable and MUST come after the graph controls `[src: traceClose]`.

**VP-181.** Opening the context menu MUST move focus into it, and closing it MUST return focus to the canvas.

**Status:** specified, not implemented in the reference build; the reference menu is pointer-driven only.

### 12.10 The simulation freeze control

**VP-182.** A freeze control MUST be offered, toggling whether the force simulation advances `[src: gLayout]`:

```
onFreezeToggle():
  1. layoutOn ← not layoutOn
  2. if layoutOn: alpha ← 0.6            // resume with real energy
  3. reflect the new state in the control's pressed state and its description
```

**VP-183.** The freeze control MUST be **disabled** whenever the resolved Layout mode is not force, and its explanation MUST say why — *"{Layout mode} is computed once, so there is nothing to freeze"* `[src: relayout()]`.

**VP-184.** Resuming MUST set alpha to `0.6`, not to 1. A resume is a nudge, not a restart.

---

## 13. Reported counts

### 13.1 The figures

**VP-185.** Exactly these figures MUST be reported, in exactly these places:

| Figure | Value | Location | Source |
|---|---|---|---|
| Store triples | total triple count of the Store | status bar, "Store **n** triples" | `[src: updateStoreUI()]` |
| Classes | count of classes in the Store | status bar, "Classes **n**" | `[src: updateStoreUI()]` |
| Individuals | count of Individuals in the Store | status bar, "Individuals **n**" | `[src: updateStoreUI()]` |
| In-view nodes | resident node count | status bar, "In view **n** nodes"; Budget panel, "In view — **n** nodes" | `[src: updateBudgetUI()]` |
| In-view relationships | resident edge count | status bar, adjacent to the node count | `[src: updateBudgetUI()]` |
| Hidden-neighbour aggregate | `totalHidden()` | Budget panel, "Hidden neighbours — **n**" | `[src: updateBudgetUI()]` |
| Occupancy | `min(100, round(nodeCount / Budget × 100))` | Budget panel meter | `[src: updateBudgetUI()]` |
| Zoom | `round(view.k × 100)` per cent | status bar, "Zoom **n%**" | `[src: updateBudgetUI()]` |
| Active Layout mode | the resolved mode's display name, suffixed `" (auto)"` when the user's choice is auto | status bar, "Layout **name**" | `[src: relayout(), LAYOUT_NAMES]` |
| Selection | Kind label and label of the selection, or "No selection" | status bar | `[src: selectEntity()]` |

### 13.2 The non-conflation rule

**VP-186.** In-view figures and in-Store figures MUST NOT be conflated, MUST NOT be summed, and MUST NOT be presented in a way that invites either. Specifically:

- Each figure MUST carry a word that scopes it — "Store", "In view".
- The two groups MUST be visually separated `[src: statusbar]`.
- No single figure may be composed of one of each.
- No label may be ambiguous between them. "Nodes: 1,000" is a defect; "In view 1,000 nodes" is correct.

**VP-187.** The in-view edge count MUST be labelled **"relationships"**, and **"triples"** MUST be reserved for the Store. An in-view edge is a drawn relationship between two resident entities; a Store triple may have a literal object that is never a node, so the two are not the same unit and MUST NOT share a noun.

**Status:** specified, not implemented in the reference build — the reference status bar reads "In view **n** nodes · **n** triples" `[src: updateBudgetUI()]`.

**VP-188.** The hidden-neighbour aggregate MUST be presented adjacent to the in-view node count, because it is the honest completion of that figure: "1,000 in view" is only meaningful alongside "8,412 held back".

### 13.3 Update discipline

**VP-189.** The in-view group, occupancy, hidden aggregate and zoom MUST be refreshed by a single function called after every operation that could change them `[src: updateBudgetUI()]`. The reference calls it after admission, removal, expansion, collapse, pin, clear, Budget change, zoom, fit, layout, reveal, drag release, splitter release and window resize.

**VP-190.** The Store group MUST be refreshed only on Store mutation `[src: updateStoreUI()]`, never per frame.

**VP-191.** No reported count MUST be recomputed inside the render loop. All are recomputed on event `[src: frame()]`.

**VP-192.** All counts MUST be rendered with locale-aware thousands grouping in British English `[src: fmt()]` — `1,000`, not `1000`.

**VP-193.** The empty-view placeholder MUST be shown exactly when the Viewport holds no nodes, and hidden otherwise `[src: updateBudgetUI()]`.

---

## 14. Performance requirements

All figures are for a Viewport at the default Budget of 1,000 nodes with approximately 3,000 edges, on a 2020-or-later mid-range Windows 11 laptop, single-threaded unless stated.

### 14.1 Per frame

**VP-194.** The frame loop MUST be: advance layout, draw, schedule the next frame `[src: frame()]`. It MUST NOT perform admission, Eviction, adjacency enumeration or count recomputation.

**VP-195.** Per-frame budgets at 1,000 nodes:

| Stage | Budget | Note |
|---|---|---|
| Layout step — one force tick including collisions | **≤ 6.0 ms** | See [Force-directed](21-layout-algorithms.md#5-force-directed) |
| Draw | **≤ 8.0 ms** | See [Rendering](22-graph-rendering-and-export.md) |
| Total frame | **≤ 16.7 ms** | 60 frames per second |

**VP-196.** When the resolved Layout mode is not force, or the simulation is frozen, or alpha has fallen below `0.004`, the layout step MUST cost constant time — an early return `[src: forceTick(), stepLayout()]`.

**VP-197.** Hit testing MUST cost `O(nodeCount)` with a small constant and MUST complete in **≤ 0.5 ms** at 1,000 nodes. It runs on every pointer move `[src: hitTest()]`.

**VP-198.** Hover MUST perform no allocation on the unchanged path (**VP-150**, line 4).

**VP-199.** The frame loop MUST NOT allocate per frame beyond the layout's transient structures. Sustained allocation at 60 frames per second is what turns a smooth graph into a stuttering one.

### 14.2 Per expansion

**VP-200.** Expansion budgets, measured from user gesture to the first painted frame showing the result:

| Operation | Budget |
|---|---|
| Expanding a node of true degree at most 50 | **≤ 16 ms** |
| Expanding a node of true degree at most 500 | **≤ 60 ms** |
| Expanding a node of true degree at most 4,000 (capped enumeration) | **≤ 200 ms** |
| Seeding from one focus with a fresh layout at Budget 1,000 | **≤ 400 ms** |

**VP-201.** Adjacency enumeration MUST be linear in the node's true degree, capped at 4,000 materialised entries (**VP-111**).

**VP-202.** Linking a batch of fresh nodes MUST cost the sum of their degrees, with expected constant cost per edge insertion, given a hash-keyed edge map (**VP-20**).

**VP-203.** An operation projected to exceed **200 ms** MUST show a progress or busy indication before starting, and MUST yield to the UI thread so that the indication paints. The reference does this for Store regeneration by deferring the work to the next animation frame after showing the trace `[src: regenerate()]`.

### 14.3 Per eviction

**VP-204.** Eviction budgets:

| Operation | Budget | Note |
|---|---|---|
| Computing the Eviction order at 1,000 nodes | **≤ 1.0 ms** | `O(n log n)` sort |
| Evicting one node with an incidence index | **≤ 0.05 ms** | linear in that node's in-view degree |
| Evicting 500 nodes — Budget lowered from 1,000 to 500 | **≤ 40 ms** | Must not be perceptible as a stall |

**VP-205.** The reference's whole-edge-map scan per Eviction (**VP-30**) makes a 500-node Eviction cost one and a half million edge visits at 3,000 edges. Implementations MUST use an incidence index to meet **VP-204**.

### 14.4 Scaling

**VP-206.** At the maximum Budget of 3,000 nodes the frame budget MAY relax to 33 ms (30 frames per second) during active simulation, but MUST return to 16.7 ms once alpha falls below `0.004` and the layout stops stepping.

**VP-207.** No operation's cost MUST scale with the Store size, except the Store-level counts (**VP-190**) and the initial adjacency enumeration of a single high-degree node, which is capped (**VP-111**).

**VP-208.** These budgets MUST be enforced by automated performance tests over the Pizza fixture. See [Acceptance criteria and tests](61-acceptance-criteria-and-tests.md) and [Pizza ontology fixture](62-pizza-ontology-fixture.md).

---

## Appendix A — Native stack mapping (non-normative)

This appendix suggests how the normative model maps onto a native Windows 11 stack. Nothing here is binding.

### A.1 Data structures

| Model concept | Suggested native form |
|---|---|
| Node map | A dictionary from IRI to a dense index, plus parallel arrays for `x`, `y`, `vx`, `vy`, `r`, `deg`, `shownDeg`, `dist`, `touched`, and bit-sets for `pinned`, `expanded` and `dragging`. The dense-index form is what makes the force accumulation vectorisable; see [Layout, Appendix A](21-layout-algorithms.md#appendix-a--native-stack-mapping-non-normative). |
| Edge map | A dictionary keyed by a value struct of three interned IRI handles. Interning IRIs to 32-bit handles removes the string concatenation in `edgeKey()` entirely and makes the key a twelve-byte struct with a cheap hash. |
| Incidence index (**VP-30**) | Compressed sparse row: per node, a contiguous slice into an edge-index array, rebuilt on structural change. |
| Focus set, pins | Hash sets over dense indices, or bit-sets at Budget 3,000 or below. |
| Touch clock | A 64-bit integer with ordinary increment; no atomics are needed if all Viewport mutation stays on one thread. |

### A.2 Threading

The Viewport SHOULD be mutated on the UI thread only. Admission, Eviction, expansion and collapse all sit well inside a frame budget at Budget 3,000, so moving them off-thread buys nothing and costs a synchronisation model. The *layout* is the part worth moving; see the layout document's appendix.

Adjacency enumeration over a very large instance bucket (**VP-203**) is the one candidate for background work. A reasonable shape: enumerate on a thread-pool task, marshal the resulting IRI list back to the UI thread, and run admission there.

### A.3 Input

- Take pointer capture on press so that pan and drag survive the pointer leaving the window; this replaces the reference's window-level move listener (**VP-132**).
- Reduce high-resolution wheel deltas to a sign before applying **VP-137**.
- Precision-touchpad pinch maps to the same anchored-zoom routine, with the pinch centroid as the anchor.
- The context menu is a platform menu populated per **VP-159**, with enablement bound to the same predicates.

### A.4 Accessibility

- The canvas is a single automation element with a name and a live description carrying the reported counts.
- The trace Surface is a live region at polite priority.
- Every context-menu item needs an automation name identical to its visible label, including the trailing hint.
- The keyboard gaps in **VP-176** and **VP-181** MUST be closed in the native build; a pointer-only graph is not shippable.

### A.5 Rendering handoff

The Viewport publishes, per frame: the node array, the edge array, the camera, the hovered IRI, the selected IRI, and the layout decoration records — group frames and radial rings. The renderer MUST treat all of these as read-only. See [Rendering and export](22-graph-rendering-and-export.md).
