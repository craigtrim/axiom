# Functional search tests

The search suite contains 2,902 independently reported cases. It tests the automatic search behavior implemented for issue #17: lexical retrieval, field and category selection, ranked semantic enrichment, resource suggestions, graph membership, and changes to the ontology. Its assertions concern returned data. It contains no latency, throughput, memory, or cache-hit timing assertions.

Run the focused suite with:

```powershell
npm run test:search:functional
```

Vitest writes the named results to `artifacts/search-functional.json`. The same tests also run under `npm test`. They require no model files, inference service, network connection, or downloaded ontology. Semantic tests supply explicit scores so a failing result has a reproducible cause.

## Coverage inventory

| File under `tests/domain/`             |     Cases | Behavior checked                                                                                                                              |
| -------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `search-functional-lexical.test.ts`    |     2,113 | 1,536 preferred-label queries, 512 alias queries, 64 graph and public-entry-point checks, and the minimum-pattern guard                       |
| `search-functional-boundaries.test.ts` |        81 | Unicode normalization, punctuation, empty input, negative queries, typo limits, and precise-match precedence                                  |
| `search-functional-scope.test.ts`      |       106 | Selected fields, RDF values, alias predicates, referenced resources, generated instances, category combinations, exclusions, and facet counts |
| `search-functional-results.test.ts`    |       242 | Numeric queries, exact page contents, ordering, ties, suggestion limits, graph bounds, input validation, and saved-option migration           |
| `search-functional-semantic.test.ts`   |        37 | Score admission, relative cutoff, fill limits, rank fusion, scope eligibility, evidence, and missing scores                                   |
| `search-functional-lifecycle.test.ts`  |       323 | Renames, aliases, deletion, IRI changes, custom fields, undo/redo, class creation, store isolation, and read-only search behavior             |
| **Total**                              | **2,902** |                                                                                                                                               |

The query matrix alone has 2,048 cases, comprising 2,038 distinct raw strings and 1,398 distinct strings after search normalization. The suite requires at least 1,000 distinct strings at both levels. It also checks that case IDs are unique. Case, whitespace, and punctuation variants therefore cannot satisfy the minimum by themselves.

Generate a complete review catalog with:

```powershell
npm run test:search:catalog
```

`artifacts/search-query-catalog.json` lists every matrix case with its stable ID, purpose, exact query, expected first IRI, and the search surfaces exercised. Preferred-label cases also name a competing entity that must remain in the results. The generator reads the authored fixtures; it does not obtain expected answers by running search.

## Vocabulary and expected answers

[The catalog](../tests/fixtures/search/catalog.ts) defines 64 concepts across computing, sciences, public services, and the humanities. Each has an independently supplied alias, such as `Reading Comprehension` / `Text Understanding` or `Information Retrieval` / `Document Discovery`.

[The fixture](../tests/fixtures/search/fixture.ts) adds a competing `Extended <preferred label>` class for each concept and a common ancestor. It rotates aliases through `skos:altLabel`, `skos:prefLabel`, literal `rdfs:seeAlso`, and an additional language-tagged `rdfs:label`. Comments and custom catalog codes provide fields that can be selected independently.

Expected identities come from the vocabulary, not from a search snapshot. Each preferred-label case requires the canonical entity first, the competing entity somewhere in the result set, and no repeated identities. The same query must rank the canonical entity first in class resource suggestions. Alias cases require the canonical entity first through the name scope and through suggestions.

Every Vitest case includes its ID and query. For example, `LEX-concept-01-reversed` queries `Comprehension Reading` and expects the `Reading_Comprehension` IRI first. `ALIAS-concept-01-prefix` queries `Text Unde` and expects that same identity.

## Preferred-label query patterns

Each of these 24 patterns runs against all 64 concepts, producing 1,536 cases. Examples use `Reading Comprehension`.

| Pattern ID          | Example query                      | Required behavior                                       |
| ------------------- | ---------------------------------- | ------------------------------------------------------- |
| `exact`             | `Reading Comprehension`            | Preferred exact label ranks first                       |
| `lowercase`         | `reading comprehension`            | Lowercase input preserves the result                    |
| `uppercase`         | `READING COMPREHENSION`            | Uppercase input preserves the result                    |
| `reversed`          | `Comprehension Reading`            | Reversed terms still find the intended class            |
| `last-prefix`       | `Reading Comp`                     | An unfinished final term matches                        |
| `first-prefix`      | `Read Comprehension`               | Prefix matching applies to the first term               |
| `both-prefixes`     | `Read Comp`                        | Both terms may be prefixes                              |
| `reversed-prefixes` | `Comp Read`                        | Prefix matching does not require label order            |
| `hyphen`            | `Reading-Comprehension`            | A hyphen separates terms                                |
| `underscore`        | `Reading_Comprehension`            | An underscore separates terms                           |
| `slash`             | `Reading/Comprehension`            | A slash separates terms                                 |
| `tab`               | `Reading\tComprehension`           | Pasted tab-separated terms match                        |
| `newline`           | `Reading\nComprehension`           | Multiline input matches                                 |
| `nbsp`              | `Reading\u00a0Comprehension`       | A nonbreaking space separates terms                     |
| `padding`           | `  Reading   Comprehension  `      | Outer and repeated spaces are harmless                  |
| `and`               | `Reading and Comprehension`        | A filler word between terms is tolerated                |
| `stopwords`         | `the Reading of the Comprehension` | Several filler words are tolerated                      |
| `extra-tail`        | `Reading Comprehension zzqvopaque` | An unmatched final term retains useful results          |
| `extra-head`        | `zzqvopaque Reading Comprehension` | An unmatched first term retains useful results          |
| `repeat`            | `Reading Reading Comprehension`    | Repeated terms do not duplicate entities                |
| `delete-first`      | `Reding Comprehension`             | A deletion in the first term retains the intended match |
| `delete-last`       | `Reading Coprehension`             | A deletion in the final term retains the intended match |
| `substitute-first`  | `Reqding Comprehension`            | A substituted character retains the intended match      |
| `insert-last`       | `Reading Coqmprehension`           | An inserted character retains the intended match        |

Escape sequences in this table describe literal whitespace in the executable cases.

## Alias query patterns

Eight patterns run against every concept, producing 512 cases. They exercise complete aliases, lowercase aliases, reversed terms, an unfinished final term, two unfinished terms, an inserted filler word, a spelling error, and an unknown extra term.

The spelling-error pattern preserves a query term of at least four characters. A four-character alias word receives a substitution; longer words receive a deletion. Separate boundary cases establish that a three-character query term has no fuzzy tolerance. This distinguishes the intended typo policy from a multiword query that happens to succeed on its other term.

## Boundary and negative cases

The normalization cases cover composed and decomposed accents, compatibility ligatures, full-width characters, camel case, digits, punctuation boundaries, pasted whitespace, and emoji boundaries. Greek, Cyrillic, Arabic, Hebrew, Chinese, Japanese, and Korean examples check matching within those scripts. Explicit negatives check that lexical search does not invent translation or transliteration matches.

The typo matrix uses query lengths 3, 4, 7, 8, and 12 with zero through three substitutions. Changed characters occur at the start of the word, preventing an accidental prefix match. Additional insertion and deletion cases check the same boundaries. Expected tolerance is zero edits below four characters, one edit at lengths four through seven, and two edits for longer terms.

Empty or punctuation-only Find input returns no results. Blank resource input lists eligible choices. Other negatives cover unknown terms and suffix-only matches outside the typo allowance. A separate ranking case requires a precise lexical hit to precede a fuzzy-only hit even when the latter has stronger semantic evidence.

## Scopes, facets, and result membership

The field matrix tests eight query sources against seven selections: names, IRIs, comments, a custom literal predicate, a relationship predicate, all fields, and an unknown field. It checks both inclusion in the intended scope and exclusion from unrelated scopes. Relationship values can match the referenced label or compact IRI.

Additional cases cover all four alias predicates independently. An IRI-valued `rdfs:seeAlso` remains a relationship value; it does not become a name alias. Language-tagged literals and typed literals retain their searchable lexical values. Repeating an assertion in two named graphs produces one entity and one field-facet membership.

Referenced-only IRIs appear in resource suggestions without becoming Find entities. Blank nodes are excluded from resource choices. Generated orders and customers are searched as instances, and generated order properties remain available through their own field scope.

All 16 subsets of the four Find categories have explicit expected memberships. The fixtures include ordinary and defined classes, instances, each property kind, resources, datatypes, and intersections. Exclusion cases remove each identity in turn and require the corresponding facet count to decrease. Category facets retain the counts needed to change the current selection.

## Ranking, pagination, and validation

One hundred numeric queries distinguish the requested course from neighboring course numbers through both Find and suggestions. These are functional assertions without a timing budget. The existing 100,000-class regression separately retains its numeric-ranking and bounded-result assertions.

The pagination fixture has 32 records, reversed IRI order, and scrambled insertion order. Sixteen explicit page plans run through relevance, name, reverse-name, and IRI sorting. They check every returned identity, the total count, and the effective offset. Cases include partial last pages, oversized offsets, single-row pages, and a page larger than the result set.

Ten complete page walks reconstruct the expected ordered set without missing or repeated identities. Other cases cover equal-label tie breaking, sort changes followed by a repeated relevance query, suggestion caps, and graph membership across pages. Graph checks include a requested node limit and an empty result set.

Option tests cover fractional, negative, nonfinite, and wrongly typed limits and offsets; invalid top-level input; duplicate or invalid scopes; empty selections; bounded strings; and unknown option values. Saved match-mode and threshold values migrate to the automatic behavior, while supported field and category selections remain effective.

## Semantic behavior with controlled scores

The semantic tests supply maps from indexed text to a score. They exercise search decisions independently of model loading and numerical inference.

| Decision           | Cases and expected outcome                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Absolute admission | Values immediately below, at, and above 0.5; zero, negative, and nonfinite values; accepted rows carry their evidence |
| Relative admission | Values immediately below, at, and above 0.75 when the best eligible score is 0.9                                      |
| Fill capacity      | Every lexical count from zero through twelve; semantic-only additions fill to ten and never remove lexical hits       |
| Eligibility        | Category selection and explicit exclusion apply before the fill count and relative cutoff                             |
| Preferred labels   | Exact and preferred-prefix matches retain precedence over stronger semantic alias matches                             |
| Rank fusion        | Semantic evidence can reorder hits within a lexical tier; a subsequent lexical-only request restores lexical ordering |
| Term coverage      | A match covering both terms precedes a one-term match with stronger semantic evidence                                 |
| Evidence selection | Multiple scored values produce one entity with its strongest selected value and field                                 |
| Field isolation    | Scores outside the selected scope or absent from the index cannot admit an entity                                     |
| Missing scores     | Undefined and empty score maps retain lexical results                                                                 |
| Scorer input       | The scorer receives normalized query text and only the selected corpus; punctuation-only queries do not invoke it     |

These cases establish score-handling behavior. Real MPNet phrase quality remains covered by the separate model integration checks.

## Changes to ontology data

For every concept, five independent edit scenarios check label replacement, alias addition/removal, class deletion, IRI replacement, and a new custom predicate. Each scenario checks the changed results and the result after undo and redo. Relevant scenarios also check resource suggestions, graph membership, field facets, and the values exposed for semantic scoring.

The final lifecycle cases cover a class created after search has already run, separate stores at the same version number, and repeated queries that leave ontology triples, entities, and the store version unchanged.

## Separate performance checks

Run the lexical worker benchmark independently of unit tests:

```powershell
npm run benchmark:search
```

This command builds the application and exercises the actual domain worker with 6,000 classes. It records the first query including index construction, then 100 warm queries each for Find and resource suggestions. `artifacts/benchmarks/search-worker.json` includes the CPU, measurement time, p50, p95, and maximum, with worker round-trip time included. The command exits unsuccessfully if either warm p95 reaches 30 ms. It does not impose that bound on cold index construction or every individual request.

Run the MPNet measurements separately when the local model is installed:

```powershell
npm run benchmark:search:mpnet
```

The MPNet benchmark records model loading, cold text preparation, warm query encoding, and vector scanning across batch sizes and CPU thread counts. Results are written to `artifacts/benchmarks/search-mpnet.json`. The 6,000-vector scan isolates matrix-scoring cost by repeating measured vectors; it does not measure cold inference over 6,000 distinct texts.

Run benchmarks without competing test or build workloads when comparing measurements. Machine details and raw measurements belong with a performance result. Functional search cases remain deterministic even when the machine is busy.
