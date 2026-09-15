# SPARQL execution and testing

Axiom runs local SPARQL 1.1 queries using Comunica 5.4.1 over an N3 RDF/JS store. Traqula supplies the parser, lexer and query generator. The Query pane accepts SELECT, ASK, CONSTRUCT and DESCRIBE. The engine supports aggregation, property paths, subqueries, OPTIONAL, UNION, MINUS, EXISTS, BIND, VALUES, named graphs and standard functions. See the [W3C Query specification](https://www.w3.org/TR/sparql11-query/) and [Comunica RDF/JS documentation](https://comunica.dev/docs/query/advanced/rdfjs_querying/) for the underlying interfaces.

## Local language suite

```powershell
npm run test:sparql
```

These tests also run during ordinary `npm test`. They use local fixtures and make no model calls. A network connection is not needed.

The suite has 1,642 checks:

| Coverage                                       | Checks |
| ---------------------------------------------- | -----: |
| W3C query evaluations, original and formatted  |  1,030 |
| W3C CSV result cases, original and formatted   |      6 |
| Positive and negative query/update syntax      |    368 |
| Isolated local SPARQL Update evaluations       |     92 |
| Manifest scope inventory                       |      1 |
| Axiom literal, function and result regressions |    145 |

The vendored corpus contains 1,112 manifest entries. Of those, 978 are within local scope. Another 134 concern HTTP protocols, remote services, graph-store endpoints or entailment, including two remote LOAD cases. Every entry appears in `artifacts/sparql-coverage.json` with its type and scope. No expected-failure exceptions are used.

The query harness checks bindings, unbound variables, cardinality and specified ordering. RDF graph and blank-node results use graph canonicalization so identifier spelling cannot cause false failures. Expected results are read from the W3C XML, JSON, Turtle, CSV and TSV files. Numeric result comparison permits equivalent lexical forms; separate literal tests require exact stored spelling.

Literal regressions cover string forms and escapes, Unicode, language tags, XSD numeric families, dates and durations, binary values, RDF XML/HTML/JSON, custom datatypes and ill-typed literals. They check import, query projection, STR, DATATYPE and LANG. Function cases cover string matching and replacement, casts, arithmetic, date parts, hashes, error propagation and unbound values. Tests also check final-result caps and REDUCED term identity.

`artifacts/sparql-conformance.json` records the dedicated suite result. A finite corpus cannot establish correctness for every possible query or literal.

## Real Codex integration

```powershell
npm run test:codex
```

This command builds Axiom and runs twelve Electron cases using the real Codex found on PATH and its existing CLI sign-in. It does not use Claude. It is excluded from both ordinary Vitest and ordinary Playwright runs. Missing Codex or failed authentication causes a failure, not a skipped test. This opt-in suite consumes real Codex requests.

The cases cover the reported American prefix request, changes to the ontology after generation, case-insensitive matching, class-name substrings, direct parents, refinement, instance types, COUNT, ASK, OPTIONAL, ancestor paths, grouped counts and imported labels. Each response passes through normal extraction and validation, opens as a new query in the main editor, and preserves its source document. Run remains explicit. Assertions compare actual query results with independent fixture expectations.

To test a packaged executable:

```powershell
$env:AXIOM_TEST_EXE = (Get-Content artifacts/latest-electron.json | ConvertFrom-Json).executable
npm run test:codex
Remove-Item Env:AXIOM_TEST_EXE
```

Individual cases can be selected with `node scripts/test-codex.mjs --grep 'ancestor'`.

Reports are written to `artifacts/codex-live-report/index.html` and `artifacts/codex-live-results.json`. Attachments retain the executable path, CLI version, prompt, response and actual result rows. Failed cases also retain a screenshot and trace. They contain the synthetic test ontology and generated content.

Ordinary desktop tests in tests/e2e/sparql.spec.ts cover query forms and result cells, read-only behavior, dataset refresh and recovery after errors. Query-authoring tests cover automatic delivery, independent Undo, query paging, result ownership, full-text search, restart and compact/wide layouts. Main-process and renderer tests cover persisted history and agent delivery during unsaved edits. Composer timing tests use deterministic provider fixtures, separate from the real Codex suite. tests/e2e/query-results.spec.ts checks separate result tabs, closing and reopening the Query pane, recovery without overwriting drafts, independent reruns, layout changes, detached windows, restart expiry and sending the chosen execution to the graph. tests/domain/query-results.test.ts covers immutable execution records, migration, continued numbering and source recovery.

## Execution boundaries

The query worker caches its RDF dataset by workspace epoch and store version. Edits invalidate that cache. Cancellation terminates the worker, and the next query creates a fresh one. Queries have a 30-second desktop timeout.

The 200,000-row cap applies to final solutions. It does not truncate the input to aggregates, joins, ordering or subqueries. LIMIT and OFFSET retain SPARQL semantics. The result count describes returned rows; it is not a separate count of potential matches before LIMIT. ASK returns one boolean result. CONSTRUCT and DESCRIBE return graph triples without changing the ontology.

Queries inspect asserted data. Property paths traverse those assertions; they do not imply an OWL reasoner. FROM selects locally available named graphs. Remote SERVICE and document retrieval are disabled. SPARQL Update is parsed and evaluated only by the isolated backend conformance harness, not exposed as ontology modification in the Query pane.

## Engine maintenance

`query-graphs.ts` corrects GRAPH variable scope when nested OPTIONAL, VALUES and aggregate patterns reuse the graph variable. REDUCED uses DISTINCT, which is an allowed result under REDUCED semantics and preserves language/datatype distinctions.

`query-compat.ts` contains narrow fixes for the pinned Comunica function packages: original lexical spelling for STR, inspection of ill-typed literals, ENCODE_FOR_URI escaping and RDF equality edge cases. The private function-class imports are pinned to version 5.4.0. Review or remove each fix when upgrading the engine, then run the complete local suite, desktop lifecycle tests and explicitly requested live Codex suite.

The formatter uses the SPARQL lexer, preserves token spelling except keyword case, and validates both documents. Result freshness uses the same token rules, ignoring presentation changes while preserving differences in literal data, identifiers, operators and query structure. Query-identity regressions cover those distinctions; desktop checks verify formatting, Undo, comments, genuine edits and data-change warnings without replacing the execution record. Every local W3C query evaluation is repeated after formatting. Upstream fixture bytes and licenses must remain unchanged; the source revision is recorded beside the corpus.
