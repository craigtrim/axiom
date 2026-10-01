# Text Analysis performance

## Mutatoc 0.3.0

Mutatoc 0.3.0 performs tokenization and ontology matching entirely in C. It removes the Python worker and spaCy model, so it no longer produces model entity annotations. Axiom retains ontology matching, nested source-span mapping and the 60 ms typing debounce.

Measurements on September 30, 2026 used the same `courses.owl` with 23,836 triples for sequential runs of 0.2.3 and 0.3.0 on this Windows machine. Warm parse figures are medians of three runs; load and first parse are single measurements. The benchmark ran separately from the functional test suites.

| Operation                    |     0.2.3 |    0.3.0 |
| ---------------------------- | --------: | -------: |
| Native ontology setup        |  1,104 ms |   935 ms |
| First parse after load       |  7,286 ms |  1.22 ms |
| Full parse, 97 characters    |  14.25 ms |  0.74 ms |
| Full parse, 242 characters   |  30.31 ms |  1.32 ms |
| Full parse, 2,429 characters | 154.01 ms | 15.21 ms |

The 2,429-character warm parse took about one tenth of its previous time. Source mapping added a median 1.36 ms in 0.3.0. These timings include the native protocol round trip but exclude the editor debounce and rendering. The first 0.2.3 parse also starts its Python/model pipeline; its single cold measurement should not be treated as a stable latency estimate.

All nine measured ontology-span hashes agree between versions. Complete native output differs because 0.3.0 removes model fields and changes tokenization. This comparison checks the benchmark's ontology matches; the functional suite separately checks 168 original reference cases, 1,512 punctuation patterns and all 89 literal substitution entries. Native CTest performance passed separately from its 15 functional suites.

Reports are `artifacts/mutatoc-030/axiom-benchmark-before.json`, `artifacts/mutatoc-030/axiom-benchmark.json` and `artifacts/mutatoc-030/benchmark-comparison.json`. The native performance log is `artifacts/mutatoc-030/native-performance.log`.

## Mutatoc 0.2.1

Mutatoc 0.2.1 removes repeated work in C matching and ontology construction. It retains the full spaCy pipeline, matching order, plus-span behavior, annotations and nested swap histories.

Measurements on September 26, 2026 used the local `courses.owl`, imported through Axiom, with 23,836 RDF triples. The same input and ontology were sent to versions 0.2.0 and 0.2.1 on the same Windows machine. Warm parse figures are medians of three runs; ontology setup is one measurement per version.

| Operation                                             |    0.2.0 |    0.2.1 |
| ----------------------------------------------------- | -------: | -------: |
| Native ontology setup                                 | 3,881 ms |   808 ms |
| Full parse, 97 characters                             |    32 ms |    30 ms |
| Full parse, 242 characters                            |    62 ms |    43 ms |
| Full parse, 2,429 characters                          | 6,399 ms |   213 ms |
| Desktop paste to visible highlights, 2,429 characters | 6,647 ms |   504 ms |
| Desktop first analysis, 97 characters                 | 5,846 ms | 2,918 ms |

The 2,429-character full parse is about 30 times faster. Its initial profile spent roughly 6.3 seconds in C matching and 0.16 seconds in tokenization. Source-span mapping took about 2 ms. The desktop timings include input handling, the existing 60 ms debounce, IPC and rendering. Cold initialization still takes seconds; warm typing does not reload the model. These are local measurements, not universal latency guarantees.

Exact matching previously rescanned the token stream after each replacement, performed linear synonym membership searches and copied every unrelated token. The new implementation indexes synonym membership, records possible matching windows, recomputes windows that contain a replacement and retains unrelated token objects. It still selects the longest match first and the leftmost match at that length. Ontology construction uses temporary hash indexes while preserving member and rule ordering.

All nine measured outputs have identical SHA-256 hashes for complete native results and source spans. The desktop comparison also preserves all 120 matches and their categories. Ordered snapshots agree for all 19 native ontology fixtures. An additional 266 complete-token cases generated from original Python Mutato cover overlap, replacement-created matches, the ten-token window boundary, Unicode and long repeated input.

The reusable benchmark accepts an ontology, report path and optional engine executable:

```powershell
node --import tsx scripts/benchmark-text-analysis.ts C:\path\courses.owl artifacts/text-analysis-benchmark.json
```

The benchmark reports ontology preparation, cold startup, warm parsing, tokenization, prepared-token matching and source mapping separately. It includes hashes of the source, executable, complete results and spans. Reports from this investigation are in `artifacts/analysis-benchmark-before.json`, `artifacts/analysis-benchmark-after.json`, `artifacts/analysis-desktop-before.json` and `artifacts/analysis-desktop-after.json`.

## Mutatoc 0.2.3

Mutatoc 0.2.3 builds a match index once per loaded ontology. In 0.2.2 every matching request rebuilt a hash set of the ontology's synonyms and scanned JSON objects linearly, so its cost grew with the ontology. Exact matching also stops extending a phrase once it cannot begin any synonym. Axiom loads with `interface: "data"`, and the live view that 0.2.2 built on the first parse is now built during load.

Measurements on September 28, 2026 used the same local `courses.owl` and the same benchmark, with 0.2.2 and 0.2.3 run on the same Windows machine. Warm figures are medians of three runs.

| Operation                                 |    0.2.2 |    0.2.3 |
| ----------------------------------------- | -------: | -------: |
| Native ontology setup                     |   860 ms |   856 ms |
| First parse, including model startup      | 2,621 ms | 1,545 ms |
| Full parse, 97 characters                 |    30 ms |    15 ms |
| Full parse, 242 characters                |    45 ms |    31 ms |
| Full parse, 2,429 characters              |   221 ms |   148 ms |
| Prepared-token matching, 2,429 characters |    91 ms |    16 ms |

Tokenization through the spaCy model now accounts for most of a full parse (131 ms of the 148 ms at 2,429 characters). All nine measured outputs and source spans have the same SHA-256 hashes in both versions. The native text-analysis suite (314 tests) and the Text Analysis desktop tests (24 tests) pass with 0.2.3. The reports are `artifacts/index-benchmark-before.json` and `artifacts/index-benchmark-after.json`.
