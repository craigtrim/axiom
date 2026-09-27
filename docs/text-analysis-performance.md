# Text Analysis performance

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
