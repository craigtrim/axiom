# Find and cosine similarity

Use Edit > Find (Ctrl+F) for focused type-ahead, or View > Find for the full search pane. Choose Cosine similarity in either location. Any text can be the query, including a name that does not exist in the ontology.

## Scope and results

Select Classes, Instances, Properties or Other entities independently. The field checkboxes include Names and aliases, IRI, and every predicate with values on searchable entities. This includes custom properties, descriptions, labels, seeAlso values and resource relationships. Field labels use recognized namespace prefixes. Filter fields by label or IRI, choose All fields, or return to Names only. Clearing all types or fields returns no results.

Names and aliases include display names and literal rdfs:label, skos:prefLabel, skos:altLabel and rdfs:seeAlso values. A predicate field searches its literal values or the labels and identifiers of its resource values. Generated instance properties are included. Field counts show how many entities have that field; type counts show matching entities before the type selection is applied.

Results show the cosine score, the field and value that produced it, and the entity type. Best match sorts by decreasing cosine with stable name and IRI tie breakers. The minimum-similarity slider filters scores from 0 to 1; its default of 0 retains every positive match. Zero-overlap results are omitted. Pagination covers all matches. Field selection, type selection, match mode and threshold are saved with Find preferences.

Right-click a node in Hierarchy or Graph and choose Find similar to use its displayed name as the query. This searches class and instance names and excludes the source entity. Editing the query clears that exclusion. The same action is available for a selected Find result. Search does not modify the ontology or graph.

## Open results in a graph

Choose Open results in new graph above the results. The new graph includes every match across all pages, using the current field, type and similarity filters. It also includes each match's ancestry back to the recorded roots. Shared ancestors appear once; multiple parent paths and independent roots are retained. Instances connect through their types, and properties follow their parent properties. Equivalent-class intersections retain their original predicates.

The graph opens in a separate tab with a radial layout centered on its roots. You can change the layout using the graph controls. Find keeps its filters and page, and existing graph views retain their contents and positions. The new graph is saved with the workspace. Its node budget grows when needed, up to 15,000 nodes. If matches plus ancestry exceed that limit, Axiom asks you to narrow the search before it creates a graph.

## Calculation

Axiom represents the typed query and indexed values in the same vector space. It normalizes case, accents, punctuation and camel case, then extracts word features and character trigrams within word boundaries. This representation preserves word-order independence and allows partial spelling overlap. No ontology relationships or inferred meanings alter the vectors.

For each selected field value, term frequency is 1 + ln(count), and inverse document frequency is ln((1 + N) / (1 + document frequency)) + 1. N is the number of indexed values for the selected fields. Values and queries are normalized to unit length, so their dot product is cosine similarity. Query features absent from the corpus still contribute to the query norm. A query containing additional unknown words therefore does not receive a perfect score merely because its known words match.

Each field value is scored separately. An entity receives its best value's score, so unrelated descriptions or multiple aliases do not dilute a matching name. Changing selected fields changes the indexed corpus and can change scores. These representation and aggregation choices are Axiom's search policy; the cosine calculation itself is the normalized dot product described in the [Stanford information retrieval text](https://nlp.stanford.edu/IR-book/html/htmledition/dot-products-1.html). TF-IDF and text feature extraction are also described in the [scikit-learn documentation](https://scikit-learn.org/stable/modules/feature_extraction.html#text-feature-extraction).

The reusable CosineTextIndex accepts arbitrary text values and queries independently of Find or RDF. EntityFindIndex supplies field metadata and entity filtering. Prepared field indexes and normalized feature postings are cached in the domain worker for the current dataset revision. Queries visit shared-feature postings; paging reuses ranked results. Edits and Undo invalidate the index. Up to two prepared field selections are retained. Search runs locally without model calls or downloads.
