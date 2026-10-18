# Taxonomy sparsity analysis

Right-click a class in Hierarchy or Graph and choose **Analyze > Sparsity**. Shift+F10 opens the same context menu; then A, S computes the analysis with the current settings. The Sparsity pane compares the children of every parent within that branch. **View > Sparsity** opens the settings or restores the retained report. The Scope setting offers Whole taxonomy, the current branch and each top-level branch. Whole taxonomy includes roots without an explicit subclass assertion to owl:Thing. Selecting another entity does not change the report's scope.

Choose the scope, descendant influence, minimum score and leaf inclusion, then use Compute sparsity. Findings are grouped by their parent and ranked by an integer score from 0 to 100. Expand a group and select a finding to see every sibling's direct and discounted descendant counts. Show in Hierarchy reveals the selected class while keeping focus in the report; Open in Details opens its editor. Narrow panes move these actions into More actions.

Filter classes matches the visible class or parent name. It returns to page 1. More actions also offers Expand every group, Collapse every group and Change settings. Change settings retains the open groups and filter, so another computation can resume the same investigation. A minimum outside 0 to 100 stays exactly as typed and shows a range note; the last valid minimum remains in effect.

The workspace retains the settings, report state, open groups, selection, filter and page through resizing, recovery, closing and restart. RDF edits and Undo silently recompute a visible report, retaining its selection when the comparison still exists. Analysis runs in the local domain worker and makes no RDF edits or assistant requests. A failure leaves the previous report or settings visible with an error message. This interface follows craigtrim/axiom#90.

## Method

For each candidate class v among the children of parent p:

1. Let c(v) be its number of distinct direct class children. Compare it with the arithmetic mean of c across its other siblings. The candidate is excluded from its own baseline.
2. Count distinct descendants at shortest distances 2, 3 and 4. Sum those level counts with weights 1, 0.5 and 0.25, respectively. Compare this discounted count with the corresponding mean across the other siblings.
3. For either comparison, the deficit is max(0, 1 - candidate / peer mean). A zero peer mean gives zero deficit.
4. The score is 100 times the weighted mean of the two deficits, rounded once to the nearest integer before ranking or filtering. Direct children receive 80% and descendants receive 20%. If the deeper peer mean is zero, direct children receive 100%. Descendant influence offers 0%, 10%, 20%, 30% and 40%; existing intermediate settings select the nearest chip, with halves rounding up. Weighting reuses the cached measures.

For Root with A and B, where A has five children and B has one, with no deeper descendants: B scores 80; A scores 0. The default minimum score is 25. Equally developed branches and all-leaf sibling groups score 0 and never appear as findings, even at minimum 0. A lone child has no sibling baseline and is left unscored. Leaves beside developed branches can receive high scores; the leaf filter can hide them.

This is a relative review measure. It cannot determine whether an ontology needs more concepts or whether two subjects should have equal detail. It does not infer missing concepts or estimate a statistically calibrated probability. Small peer groups and unusually large siblings should be considered when interpreting a finding; the peer count and mean are shown.

## Research basis

[Lemant, Le Sueur, Manojlovic and Noble (2022), Robust, Universal Tree Balance Indices](https://doi.org/10.1093/sysbio/syac027) develop normalized local balance measures and weighted aggregation for rooted trees, including nonbinary branching. This supports measuring local unevenness and handling variable child counts rather than applying the original binary Colless index directly to an ontology. [Accepted manuscript](https://openaccess.city.ac.uk/id/eprint/28068/8/syac027.pdf).

[Neher, Russell and Shraiman (2014), Predicting evolution from the shape of genealogical trees](https://elifesciences.org/articles/03568) introduce the Local Branching Index, which discounts surrounding tree length exponentially with distance. Axiom adapts the distance-discounting idea to discrete descendant levels; it does not implement the paper's biological prediction model or its full index.

Axiom's sibling deficit, four-level neighborhood, 80/20 weighting and default threshold are application-specific choices. The papers provide methodological grounding, not validation of those choices for ontology completeness.

## Graph handling and cost

Analysis uses the named-class hierarchy presented in Hierarchy, including projected parents from class definitions. Anonymous expression and list nodes, individuals and unrelated predicates do not contribute. Multiple inheritance creates a separate comparison under each parent. A shared descendant is counted once per candidate, using its shortest distance; it can legitimately contribute to different sibling branches.

Strongly connected components are detected with iterative traversals. Classes in cycles and candidate branches containing cycles are excluded from scoring. Clean children can still be compared beneath a parent that belongs to a cycle. The footer counts excluded parent/candidate comparisons: compared equals measured plus unscored plus excluded. Multiple parents can therefore contribute multiple exclusions for one class. This avoids turning cycles into inflated descendant counts or treating malformed branches as empty.

Traversals are iterative. Nearby counts use bounded breadth-first search, so depth beyond four does not dominate the measure. Cost is linear in the scope plus the sum of the four-level neighborhoods visited, rather than linear in all cases. Very dense multiple inheritance can increase that sum. Up to four scope reports are cached per store revision; edits and Undo invalidate the cache. Filters and weighting reuse the measures.

Each page contains 40 group bands and findings. A page beginning inside a group repeats its band without counting it again. The selected baseline stays directly beneath its finding and does not count toward the page limit. Groups sort by their highest score before filters, then their name; findings sort by score, then name. The baseline includes all measured siblings, ordered by direct count, with ties retaining the store's child order.
