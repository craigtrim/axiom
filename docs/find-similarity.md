# Find and resource search

Use Edit > Find (Ctrl+F) for type-ahead, or View > Find for the full search pane. Names, aliases and IRIs appear immediately. When the local MPNet model is installed, search adds meaning-based results after typing pauses. There is no match-mode selector. Details resource inputs use the same search index and ranking.

Find keeps completed results visible while a new search runs. Those retained results cannot be selected, added as synonyms or sent to a graph until the current search completes. Pressing Enter in quick Find waits for that query's fresh result; changing the query cancels the pending selection. An empty result replaces the previous list after completion, and changing ontologies discards results from the previous dataset. Search failures remain visible until a successful search replaces them. The busy announcement appears only when a request lasts at least 300 milliseconds.

The quick Find dialog holds its top position and search-field width as results change. This placement also applies to the application's other modal dialogs, including in detached windows. Long content scrolls within the available window height. The full Find view retains its empty-result editor while a replacement search is pending, preserving the draft and disabling its actions until the new result arrives.

## Scope and results

Select Classes, Instances, Properties or Other entities independently. Field checkboxes include Names and aliases, IRI, and predicates with values on searchable entities. These include custom properties, descriptions and resource relationships. Field labels use recognized namespace prefixes. Filter fields by label or IRI, choose All fields, or return to Names only. Clearing all types returns no results. Clearing all fields returns no results for a nonempty query; an empty query browses the selected entity types.

The scope summary states both field and type ratios, even when collapsed. Type counts evaluate the current fields for each type. Field counts evaluate each field alone under the selected types, including unchecked fields. With an empty query, field counts report populated entities. Result counts always include the store total. The result columns are Entity, Type and Synonym, followed by a reserved action column; rows show recorded ancestry and the field that matched. The selected-entity inspector states missing values explicitly.

Names and aliases include display names and literal rdfs:label, skos:prefLabel, skos:altLabel and rdfs:seeAlso values. Predicate fields search literal values and the labels and identifiers of referenced resources. Generated instance properties are included. Resource inputs also suggest referenced IRIs that have no entity declaration; Find lists declared entities and generated instances.

Search accepts partial words in any position, ignores common filler words when other query terms remain, and tolerates spelling errors in terms of four or more characters. Searching for a stopword alone still works. A query such as `reading and comp` finds Reading Comprehension; adding an unknown word does not discard otherwise useful matches.

Exact preferred labels rank first, followed by preferred-label prefixes. Other precise lexical matches precede fuzzy matches. Within these groups, coverage of more query terms ranks higher. Meaning-based ranking can reorder comparable lexical matches and fill a short result list. It cannot displace an exact preferred label or turn weak semantic similarities into a long list of unrelated results.

Pagination covers all filtered matches, with 25, 50, 100 and 200 rows per page. A new Find pane defaults to 50; existing page-size preferences are retained. Sort by best match, name in either direction or type. Field selection, type selection, sorting and recent searches persist with Find preferences. Older saved match modes and similarity thresholds are ignored; the retired IRI sort migrates to type. Background enrichment preserves the selected entity and keyboard focus. Closing a search or typing another query cancels its pending semantic work.

## Extend an entity from Find

When results are near matches, the quiet **+** beside the graph action opens the class editor with the title-cased query. Its tooltip names the proposed class. An exact name or proposed subject IRI already in the ontology disables the button and names the existing entity. A normalized-only similarity remains a warning in the editor. This check uses the whole ontology, regardless of the current search filters or result count. Empty queries, IRIs and query syntax do not offer a new class.

The editor overlays the results without changing their page, selection or scroll. **Back to results** and Escape close it and retain the draft for reopening. When a shallow pane withdraws the count strip, the same creation action is available under **More**. The row action is labeled **+ Synonym**: one press adds the query as `rdfs:seeAlso` on that existing entity. Its adjoining menu offers **Subclass** and **Instance** for classes, or **Subproperty** for object, data and annotation properties. Individuals and other entities have no creation menu. Each door opens the same editor and states its relation and target in the context bar. Drafts are retained separately for each query, door and target.

The action cluster appears on hover, focus or selection and remains visible while its menu is open. Touch users always see it. Its reserved column is 148 pixels wide, so revealing it does not move the row. Type and Synonym keep their preferred 120/180-pixel widths when space permits and shrink continuously when necessary to retain space for Entity. Narrow panes fold the action into one **+** menu in a 44-pixel column, with Synonym first. Opening a menu never selects the row; Escape or an outside press closes it. The synonym action withdraws for invalid queries, name matches and already recorded values. A successful write announces `{query} added to {entity}` and supports Undo and Redo.

The editor supports classes, named individuals and all three property kinds. It asserts `rdfs:subClassOf`, `rdf:type` or `rdfs:subPropertyOf` respectively. Targets remain visible and removable. A class without a parent goes under owl:Thing; an individual needs a class type and a subproperty needs a parent of its own property kind. Changing the target never silently changes the draft kind. Creation commits the entity, its relation and its additional statements as one Undo entry.

## A search with no results

Find states the query, scope and store size, then offers applicable remedies in order: search every field, include every entity type, and reset every filter. Each button shows its computed match count. Zero-yield remedies remain visible and disabled. Widening the scope retains the creation draft and returns to the first page.

The inline editor starts with a class draft. Its label follows the title-cased query until edited, and its subject IRI follows the label until overridden. Choose existing parents with the searchable picker; without a parent, the class is added under owl:Thing. Unconfirmed parent text blocks creation until selected or cleared with Escape. Labels are limited to 256 characters and comments to 10,000.

Add statements with the predicate chooser. Source displays escaped RDF/XML for the same validated draft that will be saved, including expanded identifiers and resource-valued predicates. Name collisions are checked across the entire ontology, including hidden properties and generated entities. Unicode names use the shared authoring identity rules. An occupied subject IRI also blocks creation. Open an existing entity to widen the query scope and reveal its result page.

Continue in Add entity carries the subject, label, description, annotations and selected parents into the full draft stack. Choosing a new parent opens that workflow directly. Source there includes the complete planned hierarchy. New parents and the class are committed together in one undoable transaction.

Creation rechecks the store version and dataset, then reads the saved parents for its acknowledgement. Find shows the saved label, widens its scope, and selects the created entity on its actual page. The inspector marks entities created during this session. The inline draft resets after success; replacing the dataset clears it. Undo restores the ontology before the transaction.

Right-click a node in Hierarchy or Graph and choose Find similar to use its displayed name as the query. This searches class and instance names and excludes the source entity. Editing the query clears that exclusion. The same action is available for a selected Find result.

## Open results in a graph

Choose Open results in new graph above the results. The graph uses the displayed search revision, including all filtered matches across every page and any completed semantic enrichment. A result token retains those exact matches, so opening the graph does not start another model request or change the search results. An ontology change invalidates old tokens.

The graph includes each match's ancestry back to recorded roots. Shared ancestors appear once; multiple parent paths and independent roots are retained. Instances connect through their types, and properties follow their parent properties. Equivalent-class intersections retain their original predicates.

The graph opens in a separate tab with a radial layout centered on its roots. Find keeps its filters and page, and existing graphs retain their contents and positions. The new graph is saved with the workspace. Its node budget grows when needed, up to 15,000 nodes. If matches plus ancestry exceed that limit, narrow the search before creating the graph.

## Local implementation

MiniSearch 7.2.0 supplies the lexical index, with OR retrieval, token prefixes and bounded fuzzy matching. Preferred labels have boost 8, aliases 5, IRIs 3, and other selected fields 1. Fuzzy matching permits one edit for terms of four through seven characters and two edits for longer terms. One index is shared by Find, result graphs and resource inputs for each store version. Edits, Undo and dataset replacement invalidate it.

Semantic enrichment uses the installed full-precision all-mpnet-base-v2 model. It never downloads a model during search. Missing or failed inference leaves lexical results available. Eligible semantic scores are at least 0.5; additional results must also lie within 0.15 of the best eligible score. Semantic-only results fill lists with fewer than ten lexical matches, up to ten total. Reciprocal-rank fusion uses k=60 within the protected lexical ranking groups. User-selected name or type sorting still applies to the final results.

One worker owns one inference session. Corpus preparation groups values by length and runs in batches of 16 with up to four CPU threads within each inference operation. Requests from different searches share that session. Each search consumer retains only its latest pending query; explicit synonym comparisons keep their place and run between preparation batches.

Up to four corpora retain normalized vectors in contiguous matrices. Full Find prepares the all-fields corpus once so the same query scores can serve the results, field counts and remedy yields. Selected fields still govern the result list. Scope changes reuse those scores; each field does not make its own MPNet request. Quick Find and resource suggestions retain their narrower corpora. The shared memory and disk text caches reuse unchanged vectors after edits. Optional disk writes run in the background, with four concurrent writes and at most 128 queued vectors. Changing datasets discards old corpus matrices and pending searches.

Run `npm run benchmark:search` for the lexical worker measurements, including a fresh build, or `npm run benchmark:search:mpnet` for the inference measurements. Both scripts write results under `artifacts/benchmarks`. Functional coverage runs separately with `npm run test:search:functional`; [the search test guide](search-testing.md) describes its 2,902 cases and complete query catalog.
