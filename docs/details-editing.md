# Details editing

Details has two columns: Predicate and Value. Predicates use dropdowns and recognized prefixes, including skos:, dc: for Dublin Core elements, and dcterms: for Dublin Core terms. Full identifiers remain available in tooltips and Source. The Dublin Core namespaces identify different vocabularies and remain distinct. See the [DCMI terms reference](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) and [SKOS reference](https://www.w3.org/TR/skos-reference/).

For named ontology classes, the rdf:type owl:Class declaration appears first and is read-only in the grid. The declaration has no row actions. Instance type assignments remain editable. Grid edits apply when the user leaves a cell or selects a resource. Source edits require Save source.

## Resource values

Start typing a name or IRI in a resource cell. Search matches label words, alternate labels, local identifiers, recognized prefixes, and full IRIs. Multiple words can be entered in any order. The list includes identifiers to distinguish duplicate labels. Arrow keys choose a result, Enter accepts it, and Escape restores the previous value. Mouse selection works in docked and detached Details panes. Edge endpoints use the same control.

The domain worker maintains an inverted token index for the current dataset revision. Queries use the smallest matching postings list, return at most 24 choices, and do not scan the ontology for each keystroke. Broad searches have a candidate bound; another word narrows the search. The control waits 80 ms after typing and ignores outdated replies. Dataset changes and Undo invalidate the index.

Resource rows have no per-value open button (#37). Ancestry cards open a class's ancestors, and the hierarchy, Find and the graph open any other entity. Back returns to the previous entity or edge. The former statement-options dialog has been removed. A remove button appears when an editable row is hovered or focused. Language, datatype, and statement graph metadata remain in the RDF and can be edited in Source.

## Shared seeAlso values

Different entities may use the same `rdfs:seeAlso` value. In Details and the Find creation editor, a matching value on another entity adds an amber outline and a warning triangle to the field. The triangle explains which entities share it. This is an advisory, never a validation error or a reason to block saving.

Text matching ignores case and surrounding spaces, and compares strings across language tags and datatypes. Resource IRIs match exactly and are distinct from literal strings. Other predicates and the current entity's own values do not trigger the warning.

**Dismiss this warning** remembers the ontology, entity and value. **Don’t warn about shared seeAlso values** disables this warning type in all current and future workspaces. Both choices persist locally across restarts without changing the ontology. **Edit > Settings > Warnings** can re-enable this warning type or restore individually dismissed warnings. Opening a workspace does not replace these personal choices.

## Parent classes

Add parent inserts a searchable class row. Add another parent to assign another rdfs:subClassOf statement. This requires no logical operator. Simple anonymous subclass intersections are normalized to ordinary parent statements when the dataset is rebuilt. This preserves their OWL meaning without adding equivalence. Shared and annotated structures that still have uses remain intact.

C being a subclass of both A and B is logically equivalent to C being a subclass of their intersection. It does not establish that C is equivalent to that intersection. Equivalence also asserts that every instance common to A and B belongs to C. This follows the intersection and class-axiom definitions in [OWL 2 Direct Semantics](https://www.w3.org/TR/owl2-direct-semantics/).

Local label suggestions default to Add parents. An equivalent intersection definition requires explicitly choosing Equivalent to their intersection. Existing equivalence, union, nested, annotated, and malformed expressions retain their meaning. Their triples appear in the owning entity's Source, where they can be edited.

## Source snippets

Details shows source whenever the pane is at least 400 px tall (416 px when growing back from shallow). The editor uses a single text color, with no gutter, line numbers or folding. It grows by one row per line up to 14 rows, then scrolls. Flat Turtle snippets show one statement per line. Ctrl+F searches the snippet; clipboard commands and local text Undo/Redo remain available. Source contains the selected entity and the anonymous structures it references. It does not include descriptions of unrelated named entities. Anonymous expression Details uses the same scoped editor.

Turtle uses anonymous property lists and RDF collection syntax where identities can safely be private. Shared or cyclic blank nodes retain explicit identifiers when needed. Anonymous snippets use their owning entity's namespace. The format select offers Turtle, RDF/XML, JSON-LD, N-Triples, N-Quads and TriG. It changes only the Details presentation; the original file format stays unchanged. Choosing a format applies a valid draft first. Invalid or stale drafts block the change, and formats that would lose named graphs are disabled.

The header is the only save-status location. A pending source draft offers **Discard** and **Save source**. Invalid source offers **Discard draft**; a refused conflicting save offers **Discard draft and reload**. Save source parses and applies the snippet as one Undo operation. Independent source and grid changes merge; a newer ontology revision alone does not make a draft stale. Invalid or conflicting edits preserve the text and leave the ontology unchanged.

Draft text and validation survive navigation, closing the pane and workspace saves. Shallow panes hide source and the IRI/revision footer while retaining the draft and its header actions. Escape inside source discards a pending or invalid draft; Escape in resource cells still restores that cell.
