# Find Touchpoints

Select an entity and choose **Find > Touchpoints** in its taxonomy or graph menu. The graph selection bar also offers this action; Inspector exposes **Find touchpoints** under **···**. **View > Touchpoints** opens the pane for the selected entity.

Each subject has one pane titled **Touchpoints, {subject label}**. Opening the action again focuses that pane. Selection changes never retarget it, and closing and reopening it never adds a numeric suffix. Separate subjects can have separate panes, including detached windows.

The query starts with the preferred label and remains editable. Press Enter or choose **Search** to fetch up to twenty English Wikipedia candidates. Typing does not send requests. Each row shows its title, tags and short description. Selecting a row reveals its relationship, target and the IRI it will write. That IRI withdraws below 600 pixels wide. The subject, query, Search, Refresh and More actions share one action row; the footer keeps the selection count, Apply and facts about the displayed result.

When the local MPNet model is available, Axiom uses the entity's label, parents and description to rank the returned candidates. Each ranked row shows `rank {n}`, the similarity multiplied by 100 and rounded. Without the model, Wikipedia's ranking is retained and the rank figures disappear. Search does not invoke Claude or Codex.

## Review and apply

Select the rows to add and review their relationship and target. A matching label, alias or redirect suggests `skos:exactMatch`; other candidates start with `skos:closeMatch`. You can also choose `skos:broadMatch`, `skos:narrowMatch`, `skos:relatedMatch` or `rdfs:seeAlso`. Individuals additionally offer `owl:sameAs`.

DBpedia is the default target. Wikidata is available when Wikipedia reports an item ID. Wikipedia is also available and becomes the default target for `rdfs:seeAlso`. Every touchpoint is a resource statement. Text synonyms continue to use the separate Find Synonyms action.

Disambiguation pages cannot be selected. A candidate already linked through its Wikipedia, DBpedia or Wikidata identity is marked **Linked**. Both resource objects and `xsd:anyURI` literals count as links. Linked rows remain selectable so you can add a different relationship or target. An exact duplicate resource statement rejects the whole batch and names the row. **Apply selected touchpoints** adds the reviewed statements as one Undo operation. If the ontology changes after a search, search again before applying. Validation rejects the whole batch if any selected statement is unavailable or invalid, keeping your choices. A successful apply allows another batch without searching again.

## Saved results and refresh

Wikipedia results are stored under `~/.axiom/wikipedia`. **They have no automatic expiry.** Search reuses a valid saved entry regardless of its age, including after restart. Opening a pane reads its saved result without making a request. The pane displays the local fetch date, or `just now` during the first minute. **Refresh** explicitly requests new results. A failed refresh retains the saved rows and every selection and choice, then shows the error. **Clear the Wikipedia cache for this subject**, under More actions, removes that subject's saved entries while keeping the query. **Edit > Settings > Clear Wikipedia cache** removes the saved entries.

The cache separates entities by a Windows-safe local name plus eight SHA-256 characters from the full IRI. Query filenames use ten SHA-256 characters from the trimmed, whitespace-collapsed, lowercase query. Stored entries retain the original query, entity IRI, host, timestamp and parsed candidates. Corrupt, unsupported or mismatched entries are cache misses. Empty results are valid saved results; failures are never cached.

All windows share one main-process request queue. A search uses one generator API request with page properties, descriptions and canonical URLs. Axiom identifies its version and Electron version in User-Agent, requests gzip, and waits on HTTP 429 according to Retry-After. Without that header, the initial wait is five seconds; consecutive throttles double the wait. The failed search returns a wait message and is not automatically retried. Requests time out after fifteen seconds.

This follows Wikimedia's [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette) and [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy). Tests use the recorded responses in `tests/fixtures/wikipedia` and injected failure responses. They make no live Wikipedia requests.

Issue #92 replaces the earlier Touchpoints exhibit with its own pinned reference. The pane uses shared recovery below 240 pixels wide, below 210 pixels tall when narrow, and below 180 pixels tall otherwise. Recovery names the subject and retains the query, saved date, results and choices. Below 400 pixels wide, the action row wraps into three lines; shallow layouts keep the actions, notes and footer.
