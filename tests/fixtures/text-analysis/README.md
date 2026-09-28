# Mutato reference cases

`reference.json` contains 168 expectations produced by the original Python Mutato `FindOntologyData` and `MutatoAPI.swap_input_text` APIs. Each profile loads its accompanying OWL file as Turtle. The metadata records the Mutato Git revision, span source hashes, LingPatLab version, spaCy version and model version.

Mutatoc 0.2.2 treats whitespace between exact phrase tokens consistently. Six explicitly identified cases (`plus-033`, `plus-035`, `plus-037`, `plus-039`, `plus-041`, and `plus-043`) now report `exact` instead of `spans`. Their canonical text and every source offset remain unchanged. The test records this narrow correction while preserving the original fixture. `text-analysis-punctuation.test.ts` adds 1,512 native matches checked against independently calculated UTF-16 ranges, plus repeated-occurrence and wrong-year regressions.

| Profile  | Cases | Contract                                                                                                                                                       |
| -------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plus     |   104 | `skos:altLabel` plus rules, both orders, case, distance boundaries, missing endpoints, punctuation, whitespace, negation words, repeated endpoints and Unicode |
| seealso  |    11 | The same plus syntax through `rdfs:seeAlso`                                                                                                                    |
| nested   |    32 | Multiword and single-word synonyms become canonical span endpoints; the highlight includes their original source text                                          |
| ordinary |    21 | Span rules generated from an ordinary multiword label                                                                                                          |

Expected canonical text and match methods come from Python swap results. Expected source ranges are located independently against the unchanged source spellings in Python's leaf history, then converted to UTF-16 offsets. This corpus avoids abbreviation and contraction expansions; the native runtime tests cover those dictionaries separately. Native token x/y coordinates and Axiom's source mapper are not used to generate the expected positions.

`text-analysis-reference.test.ts` imports each OWL file through Axiom's RDF loader, constructs the live analysis context, and calls the packaged mutatoc runtime. Each case compares the canonical result and every ontology highlight's label, method, start, end and original text. This checks the application's complete matching path rather than loading precomputed native snapshots.

Run `npm run test:text-analysis` for the required native suite. To regenerate with the original Python environment, run:

```powershell
python scripts/generate-text-analysis-reference.py --mutato D:\git\mutatos\mutato
```

The fixture OWL and input cases are authored for Axiom. The generator calls the user's original Mutato repository without copying its implementation.
