# OWL intersections

Axiom draws an intersection as a shared, branched connector from the owning class to its members. The branch point has no node, label, or selection handle. Hierarchy contains named classes; anonymous expressions and RDF collection cells stay out of the taxonomy.

| OWL statement | Connector caption |
| --- | --- |
| C is a subclass of a simple anonymous intersection of A and B | Separate ordinary subclass arrows to A and B |
| C is equivalent to the intersection of A and B | equivalent to all |
| A named class has its own intersection definition | equivalent to all |

The subclass statement means every C belongs to both A and B. Equivalence additionally says their common instances are exactly C. This distinction follows the [W3C OWL 2 Primer](https://www.w3.org/TR/owl2-primer/#Complex_Classes).

## Viewing and editing

Selecting a branch updates an already open Details pane. The pane identifies its owning expression and lets the user change or remove that member. Removing one member of a two-member intersection leaves a direct subclass or equivalence statement to the remaining member. Undo restores the expression and graph views.

Each branch retains the original axiom and statement graph. Editing one owner's expression leaves other owners of a shared expression intact. Axiom removes unused collection structure only when it has no external references or annotations. Nested members that require editing the inner expression remain available through Source.

Viewing, arranging, and exporting the graph preserves the asserted RDF. Fit, image export, and hit testing use the same branch geometry. Expansion obeys the graph node budget.

## Details parent rows

Simple anonymous subclass intersections are normalized to ordinary rdfs:subClassOf statements when the schema is rebuilt. Details presents one searchable row per named parent. Equivalence and union retain their distinct meanings. The row ellipsis opens the referenced entity and its scoped Source. See [Details editing](details-editing.md).

## Local subclass suggestions

**Suggest Sub Classes** searches for shorter existing parent names within the selected class name. Alpha Beta Gamma can suggest Alpha Gamma and Beta Gamma. The operation creates ordinary `Alpha_Beta_Gamma rdfs:subClassOf Alpha_Gamma, Beta_Gamma` statements after review.

The local matcher can omit words in the middle while preserving their order. It makes no model or network request and creates no intersection or equivalence axioms. Existing intersection definitions remain available through Details and Source.

## Parsing limits and verification

Lists are read within their statement graph. Parsing detects missing links, ambiguous entries, literal members and cycles, with a 4,096-member limit. Details identifies malformed expressions. Nested traversal is bounded; property restrictions are not converted into named taxonomy parents.

Tests cover branch projection, subclass versus equivalence, shared expressions, named graphs, bounded matching, stale application, Undo, RDF export, and workspace reopening. Desktop tests include the real courses.owl file through the normal file-open workflow.

## Courses file migration

Craig requested that the existing subclass intersections in his Desktop courses.owl express equivalent-class definitions. The one-time migration changed 607 owner predicates from rdfs:subClassOf to owl:equivalentClass. Six owners also had ordinary named parents; those parent statements were retained. Canonical RDF comparison verified that all other statements were unchanged. A timestamped backup was saved beside the file.

This migration changes that document explicitly. Axiom does not reinterpret subclass statements as equivalence. Future ordinary multiple-parent relationships use separate rdfs:subClassOf statements. Existing equivalent-class definitions retain their intersection expressions.
