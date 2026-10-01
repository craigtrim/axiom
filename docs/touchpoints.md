# Find Touchpoints

Select an entity and choose **Find > Touchpoints** in its taxonomy or graph menu. The graph and Inspector also have a **Find Touchpoints** button. **View > Touchpoints** opens the pane directly.

The query starts with the preferred label and remains editable. Press Enter or choose **Search** to fetch up to twenty English Wikipedia candidates. Typing does not send requests. Each row shows its title, short description and target IRI. **Open Wikipedia page** opens the article in the default browser.

When the local MPNet model is available, Axiom uses the entity's label, parents and description to rank the returned candidates. Without the model, Wikipedia's ranking is retained. Search does not invoke Claude or Codex.

## Review and apply

Select the rows to add and review their relationship and target. A matching label, alias or redirect suggests `skos:exactMatch`; other candidates start with `skos:closeMatch`. You can also choose `skos:broadMatch`, `skos:narrowMatch`, `skos:relatedMatch` or `rdfs:seeAlso`. Individuals additionally offer `owl:sameAs`.

DBpedia is the default target. Wikidata is available when Wikipedia reports an item ID. Wikipedia is also available and becomes the default target for `rdfs:seeAlso`. Every touchpoint is a resource statement. Text synonyms continue to use the separate Find Synonyms action.

Disambiguation pages cannot be selected. A candidate already linked through its Wikipedia, DBpedia or Wikidata identity is marked **Linked**. **Apply selected touchpoints** adds the reviewed statements as one Undo operation. If the ontology changes after a search, search again before applying. Validation rejects the whole batch if any selected statement is unavailable or invalid.

## Saved results and refresh

Wikipedia results are stored under `~/.axiom/wikipedia`. **They have no automatic expiry.** Search reuses a valid saved entry regardless of its age, including after restart. The pane displays when the result was fetched. **Refresh** explicitly requests new results. A failed refresh retains the saved rows and shows the error. **Edit > Settings > Clear Wikipedia cache** removes the saved entries.

The cache separates entities by a Windows-safe local name plus eight SHA-256 characters from the full IRI. Query filenames use ten SHA-256 characters from the trimmed, whitespace-collapsed, lowercase query. Stored entries retain the original query, entity IRI, host, timestamp and parsed candidates. Corrupt, unsupported or mismatched entries are cache misses. Empty results are valid saved results; failures are never cached.

All windows share one main-process request queue. A search uses one generator API request with page properties, descriptions and canonical URLs. Axiom identifies its version and Electron version in User-Agent, requests gzip, and waits on HTTP 429 according to Retry-After. Without that header, the initial wait is five seconds; consecutive throttles double the wait. The failed search returns a wait message and is not automatically retried. Requests time out after fifteen seconds.

This follows Wikimedia's [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette) and [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy). Tests use the recorded responses in `tests/fixtures/wikipedia` and injected failure responses. They make no live Wikipedia requests.
