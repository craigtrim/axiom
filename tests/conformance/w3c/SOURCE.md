# W3C SPARQL test corpus

Source: https://github.com/w3c/rdf-tests

Revision: 369a90d1a60c021b746df2e411da0ff36258a758

Retrieved: 14 September 2026.

The sparql10 and sparql11 directories are unmodified copies of sparql/sparql10 and sparql/sparql11 at that revision. LICENSE.md is copied from the repository root. The sparql10 directory also retains its upstream LICENSE. Those notices govern the test material.

Axiom's harness is maintained separately in tests/conformance/w3c-harness.ts. It inventories manifest entries, evaluates queries against local RDF fixtures and compares the supplied expected results. The ordinary domain suite runs the local cases, including positive/negative syntax and isolated backend updates. Query evaluations run both before and after formatting.

HTTP endpoint, SERVICE and entailment suites are outside Axiom's local query scope. Remote LOAD cases are excluded for the same reason. The generated artifacts/sparql-coverage.json identifies every included and excluded manifest entry.

To update this corpus, select and record an upstream commit, copy the same directories and license files without rewriting their contents, review the scope inventory, and run npm run test:sparql. New manifest types must be explicitly supported by the harness or assigned an explained scope.
