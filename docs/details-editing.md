# Details editing

Details has two columns: Predicate and Value. Predicates use dropdowns and recognized prefixes, including skos:, dc: for Dublin Core elements, and dcterms: for Dublin Core terms. Full identifiers remain available in tooltips and Source. The Dublin Core namespaces identify different vocabularies and remain distinct. See the [DCMI terms reference](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) and [SKOS reference](https://www.w3.org/TR/skos-reference/).

For named ontology classes, the rdf:type owl:Class declaration appears first and is read-only in the grid. The declaration has no row actions. Instance type assignments remain editable. Grid edits apply when the user leaves a cell or selects a resource. Source edits require Save source.

## Resource values

Start typing a name or IRI in a resource cell. Search matches label words, alternate labels, local identifiers, recognized prefixes, and full IRIs. Multiple words can be entered in any order. The list includes identifiers to distinguish duplicate labels. Arrow keys choose a result, Enter accepts it, and Escape restores the previous value. Mouse selection works in docked and detached Details panes. Edge endpoints use the same control.

The domain worker maintains an inverted token index for the current dataset revision. Queries use the smallest matching postings list, return at most 24 choices, and do not scan the ontology for each keystroke. Broad searches have a candidate bound; another word narrows the search. The control waits 80 ms after typing and ignores outdated replies. Dataset changes and Undo invalidate the index.

Each editable resource row has one ellipsis button that opens the referenced entity in the same Details tab and expands its Source. Back returns to the previous entity or edge. The former statement-options dialog has been removed. A remove button appears when an editable row is hovered or focused. Language, datatype, and statement graph metadata remain in the RDF and can be edited in Source.

## Parent classes

Add parent inserts a searchable class row. Add another parent to assign another rdfs:subClassOf statement. This requires no logical operator. Simple anonymous subclass intersections are normalized to ordinary parent statements when the dataset is rebuilt. This preserves their OWL meaning without adding equivalence. Shared and annotated structures that still have uses remain intact.

C being a subclass of both A and B is logically equivalent to C being a subclass of their intersection. It does not establish that C is equivalent to that intersection. Equivalence also asserts that every instance common to A and B belongs to C. This follows the intersection and class-axiom definitions in [OWL 2 Direct Semantics](https://www.w3.org/TR/owl2-direct-semantics/).

Local label suggestions default to Add parents. An equivalent intersection definition requires explicitly choosing Equivalent to their intersection. Existing equivalence, union, nested, annotated, and malformed expressions retain their meaning and remain accessible through their own Details and Source.

## Source snippets

Source uses a syntax-colored code editor with line numbers, wrapping and folding. Turtle, RDF/XML and JSON-LD use their own language tokens; Turtle and RDF/XML separate subject blocks with blank lines. Source contains the selected entity and the anonymous structures it references. It does not include descriptions of unrelated named entities. Anonymous expression Details uses the same scoped editor.

Turtle uses anonymous property lists and RDF collection syntax where identities can safely be private. Shared or cyclic blank nodes retain explicit identifiers when needed. Anonymous snippets use their owning entity's namespace. Source remains in the original file's RDF serialization, with named graphs preserved. Save source parses and applies the snippet atomically; invalid or conflicting edits leave the ontology unchanged.
