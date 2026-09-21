# Taxonomy sparsity analysis

Right-click a class in Hierarchy and choose **Analyze sparsity**. The Sparsity pane compares the children of every parent within that branch. **View > Sparsity** reopens the pane. The scope stays fixed while selecting other entities; **Analyze selected** changes it. **Whole taxonomy**, or analyzing owl:Thing, includes all top-level branches, including roots without an explicit subclass assertion to owl:Thing.

Findings are ranked by a score from 0 to 100. Select a finding to see its direct child count beside its siblings, then navigate to Hierarchy or Details. The pane supports text filtering, a minimum score, leaf inclusion, and paging in groups of 40. Scope and controls are retained with workspace settings. Data is recomputed after RDF changes and Undo. Analysis runs in the local domain worker and makes no RDF edits or assistant requests.

## Method

For each candidate class v among the children of parent p:

1. Let c(v) be its number of distinct direct class children. Compare it with the arithmetic mean of c across its other siblings. The candidate is excluded from its own baseline.
2. Count distinct descendants at shortest distances 2, 3 and 4. Sum those level counts with weights 1, 0.5 and 0.25, respectively. Compare this discounted count with the corresponding mean across the other siblings.
3. For either comparison, the deficit is max(0, 1 - candidate / peer mean). A zero peer mean gives zero deficit.
4. The score is 100 times the weighted mean of the two deficits. Direct children receive 80% and descendants receive 20%. If the deeper peer mean is zero, direct children receive 100%. Descendant influence can be adjusted from 0% to 40% without another graph traversal.

For Root with A and B, where A has five children and B has one, with no deeper descendants: B scores 80; A scores 0. The default minimum score is 25. Equally developed branches and all-leaf sibling groups score 0. A lone child has no sibling baseline and is left unscored. Leaves beside developed branches can receive high scores; the leaf filter can hide them.

This is a relative review measure. It cannot determine whether an ontology needs more concepts or whether two subjects should have equal detail. It does not infer missing concepts or estimate a statistically calibrated probability. Small peer groups and unusually large siblings should be considered when interpreting a finding; the peer count and mean are shown.

## Research basis

[Lemant, Le Sueur, Manojlovic and Noble (2022), Robust, Universal Tree Balance Indices](https://doi.org/10.1093/sysbio/syac027) develop normalized local balance measures and weighted aggregation for rooted trees, including nonbinary branching. This supports measuring local unevenness and handling variable child counts rather than applying the original binary Colless index directly to an ontology. [Accepted manuscript](https://openaccess.city.ac.uk/id/eprint/28068/8/syac027.pdf).

[Neher, Russell and Shraiman (2014), Predicting evolution from the shape of genealogical trees](https://elifesciences.org/articles/03568) introduce the Local Branching Index, which discounts surrounding tree length exponentially with distance. Axiom adapts the distance-discounting idea to discrete descendant levels; it does not implement the paper's biological prediction model or its full index.

Axiom's sibling deficit, four-level neighborhood, 80/20 weighting and default threshold are application-specific choices. The papers provide methodological grounding, not validation of those choices for ontology completeness.

## Graph handling and cost

Analysis uses the named-class hierarchy presented in Hierarchy, including projected parents from class definitions. Anonymous expression and list nodes, individuals and unrelated predicates do not contribute. Multiple inheritance creates a separate comparison under each parent. A shared descendant is counted once per candidate, using its shortest distance; it can legitimately contribute to different sibling branches.

Strongly connected components are detected with iterative traversals. Classes in cycles and candidate branches containing cycles are excluded from scoring. Unaffected sub-branches can still be compared. The report surfaces both counts. This avoids turning cycles into inflated descendant counts or treating malformed branches as empty.

Traversals are iterative. Nearby counts use bounded breadth-first search, so depth beyond four does not dominate the measure. Cost is linear in the scope plus the sum of the four-level neighborhoods visited, rather than linear in all cases. Very dense multiple inheritance can increase that sum. Up to four scope reports are cached per store revision; edits and Undo invalidate the cache. Filters and weighting reuse the measures. Results render 40 rows per page.
