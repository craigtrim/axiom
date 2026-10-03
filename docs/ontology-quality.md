# Ontology quality scanning

Open **Tools > Check ontology...**, choose the scope and checks, then select **Run scan**. **View > Ontology Quality** reopens the pane. Both commands are available in the command palette and shortcut settings. Results work in a detached pane as well.

The scanner reads the current loaded statements without editing them. It captures an ontology revision and processes that immutable input in cooperative batches on the domain worker. Canceling a scan leaves no complete report. Failed scans are also distinguished from completed scans with zero findings. Edits, Undo/Redo, and workspace replacement make older results visibly stale.

## Scope and policy

The default is the whole loaded ontology. A namespace scope uses the exact namespace before the last fragment, slash, or colon delimiter. A taxonomy branch contains the chosen named class and its named descendants; owl:Thing selects the whole named taxonomy. Entity kinds and check groups can be selected independently.

Completeness applies to named subjects present in the loaded data. Built-in vocabulary, reference-only external resources, anonymous expressions, and ontology records are excluded from entity completeness denominators. Ontology metadata has its own denominator. Declared imports are listed, but a scan does not fetch them or assume a complete import closure.

There are 36 rules across completeness, naming, structure, retired entities, publication metadata, and Text Analysis compatibility. Each can be disabled or assigned Information, Warning, or Violation. Findings identify the source of the constraint. A configured project violation is not automatically an RDF/OWL standards violation.

The Axiom profile accepts rdfs:label and skos:prefLabel as primary names. The SKOS profile uses skos:prefLabel. OBO-inspired requires an explicit primary name and dedicated definition but is not a complete OBO certification profile. Users can configure accepted primary-label, description, definition and replacement predicates, and preferred languages.

Descriptions accept the configured predicates, including rdfs:comment, skos:definition, dcterms:description and IAO:0000115 by default. Resource-valued documentation references count as supplied documentation. Dedicated definitions remain distinct from general comments. Optional alias coverage, documentation notes, naming style, explicit superclass coverage and publication metadata are disabled by default.

SKOS label cardinality and conflicting roles use RDF terms, including language and datatype. RDFS multiple labels remain a review warning. Case/whitespace-normalized naming collisions are separate review findings. Individuals may have multiple types, roots may lack parents, annotation properties need not have domains/ranges, and hierarchy cycles can imply equivalence rather than inconsistency.

Structural findings cover isolated entities, disconnected named-class components, cycles, missing declarations, individual typing, references undefined in the loaded data, and object/data property domain/range information. Undefined references can be intentional external links. Domains/ranges are never automatically added.

## Findings, evidence and exceptions

Filter by text, rule, group, severity, kind, and namespace; organize rows by rule or entity. Pagination displays 40 findings at a time and does not cap the retained results. Each selected finding shows the exact IRI, policy, explanation, suggested action, and statement evidence, including named graphs. Details navigation is guarded by the report's dataset/revision.

Coverage reports distinct applicable and affected entities, not-applicable entities, and disabled checks. The report separately counts suppressed findings. These totals avoid treating findings as entity counts.

An intentional exception requires a reason. It is stored in workbench preferences outside ontology RDF, keyed to the ontology identity, exact entity, rule and a fingerprint of the finding's evidence and policy. Changed evidence/policy must be reviewed again. Show suppressed findings or use Recorded exceptions to remove an exception. Exceptions survive normal application restarts and source reloads.

Export JSON or CSV through the native save dialog. Export includes all findings, even when filters or pagination hide rows, together with configuration, revision, scope, coverage, import notes and exception reasons. A stale report remains an export of its recorded revision. A canceled/failed scan cannot be exported as complete.

## Reviewed label additions

Select **Review missing labels** for a completed, current report. Review the identifier-derived candidates, select the desired entities, and edit their labels, predicate or language. Select **Preview selected additions** to see the exact statements, including datatype and graph.

Applying the preview adds the selected labels in one undoable edit. There is no 100-statement cap. Established and placeholder identifiers are preserved; this path does not run the normal placeholder-renaming behavior. Existing annotations are retained. A single-source-graph entity receives its label in that graph; entities described across multiple graphs receive the addition in the default graph, which is visible in the preview.

Every apply is guarded by dataset, revision, and the exact active preview token. Intervening edits, replaced previews, invalid batches, duplicate selections, and repeated application are rejected before mutation. Only scanned missing-label entities in the editable Store are eligible. Blank or conflicting existing labels should be edited in Details rather than overwritten by this action.

## Text Analysis compatibility

The issue #38 investigation found that Industrial Safety had no asserted label or synonym; its displayed name was synthesized from the IRI. A missing-label rule therefore reads statements, never the display fallback. Text Analysis eligibility is derived from the existing concept-map function. An entity with a supported alias but no primary label receives a completeness finding without an incorrect exclusion finding.

The scanner does not change matching. Literal rdfs:seeAlso synonyms are reported as a legacy convention; legitimate resource links are not classified as those aliases. No predicate migration is performed. Raw identifier matching limitations, logical consistency reasoning, semantic truth assessment, and remote link verification remain separate concerns.

## Validation

Functional cases are in `tests/domain/ontology-quality.test.ts` and `tests/e2e/ontology-quality.spec.ts`. They cover the Industrial Safety case, all rule triggers, kinds/identifier forms/languages/named graphs, configured predicates, reference and import scope, cardinality, identity collisions, exceptions, complete exports, revision races, cancellation/failure, and 137 additions with Undo/Redo. Desktop cases exercise native menus, filtering, exact Details navigation, persisted exceptions, exported files, pagination, stale previews, dark detached panes and accessibility.

Performance measurements are separate: `node --import tsx tests/performance/ontology-quality.ts [ontology-file]`. They record synchronous snapshot time, complete scan time, scheduling gaps, cancellation and memory without asserting machine-dependent timing thresholds. The scanner is a deterministic review tool, not a proof that an ontology is correct or complete.

Research and the full acceptance criteria are recorded in GitHub issue #42. No new runtime dependency is required for the scanner.
