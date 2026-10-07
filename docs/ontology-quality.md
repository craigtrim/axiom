# Ontology quality scanning

Open **Tools > Check ontology...** to open the pane with its settings expanded, choose the scope and checks, then select **Run scan**. **View > Ontology Quality** reopens the pane as it was left. Both commands are available in the command palette and shortcut settings. Results work in a detached pane as well.

The scanner reads the current loaded statements without editing them. It captures an ontology revision and processes that immutable input in cooperative batches on the domain worker. A canceled scan keeps the findings it reached, marked incomplete and never exportable as complete. A failed scan shows its reason and no findings, because a partial rule pass cannot be distinguished from a clean one. A scan with every check group switched off completes with nothing to test and says so; it is never presented as a clean result.

Results become stale for one of two reasons, and the pane names which. Edits, Undo/Redo, and workspace replacement change the store, so the band names the revision the findings came from and the revision the store is now at. Changing the scope, the checks, or a rule's severity changes the settings, so the band names the check count and scope the findings came from without claiming the ontology changed. Stale findings stay readable until the rerun completes.

## Scope and policy

The default is the whole loaded ontology. A namespace scope uses the exact namespace before the last fragment, slash, or colon delimiter. A taxonomy branch contains the chosen named class and its named descendants; owl:Thing selects the whole named taxonomy. Entity kinds and check groups can be selected independently. A namespace scope with no namespace, or a branch scope with no root, disables **Run scan** and says what is missing.

Completeness applies to named subjects present in the loaded data. Built-in vocabulary, reference-only external resources, anonymous expressions, and ontology records are excluded from entity completeness denominators. Ontology metadata has its own denominator. Declared imports are listed, but a scan does not fetch them or assume a complete import closure.

There are 36 rules in six groups: Completeness, Naming, Structure, Retired entities, Publication metadata, and Text Analysis compatibility. Each can be disabled or assigned Information, Warning, or Violation under **Rules**, which shows each rule's default beside its configured severity. Findings identify the source of the constraint. A configured project violation is not automatically an RDF/OWL standards violation, and the Rules view says so. Settings saved under the earlier group names are read under the new ones.

There are no named profiles. Users configure the accepted primary-label, description, definition and replacement predicates, and preferred languages. Primary labels default to rdfs:label and skos:prefLabel. Descriptions accept rdfs:comment, skos:definition, dcterms:description and IAO:0000115 by default. Resource-valued documentation references count as supplied documentation. Dedicated definitions remain distinct from general comments. Optional alias coverage, documentation notes, naming style, explicit superclass coverage and publication metadata are disabled by default. Settings saved with a profile keep their predicates and severities; the profile itself is ignored.

### Vocabulary census

Before a scan selects its checks it takes a census of the in-scope statements and the ontology records: the predicates in use, plus the classes entities are typed with. The settings block shows the same census before any scan. A rule that tests how a vocabulary is used is withdrawn when that vocabulary is absent: without SKOS, the three SKOS label rules; without owl:deprecated, the three retired-entity rules, and with them the Retired entities group. A withdrawn rule is not listed, not counted, has no coverage row, and is never reported as passing. Rules that test for something missing are never gated, so missing publication metadata is still reported in an ontology without Dublin Core. Dublin Core and IAO only decide which predicates a finding's basis and the coverage notes may name. The report and both export formats record the census and the withdrawn rules.

SKOS label cardinality and conflicting roles use RDF terms, including language and datatype. RDFS multiple labels remain a review warning. Case/whitespace-normalized naming collisions are separate review findings. Individuals may have multiple types, roots may lack parents, annotation properties need not have domains/ranges, and hierarchy cycles can imply equivalence rather than inconsistency.

Structural findings cover isolated entities, disconnected named-class components, cycles, missing declarations, individual typing, references undefined in the loaded data, and object/data property domain/range information. Undefined references can be intentional external links. Domains/ranges are never automatically added.

## The pane

Findings follow Craig's issue #44 reference, pinned at `tests/fixtures/quality-visual/visual-reference.html`. Scan settings and the states before findings follow the newer issue #65 reference, pinned at `tests/fixtures/quality-settings-visual/visual-reference.html`. Before a scan, the command bar carries the title and state; the scrollable body contains the headline, four settings rows and a separate Run scan action. Each settings row stays 32 pixels tall. The entity-kind, check and vocabulary rails scroll horizontally without wrapping and retain their position when reopened. Completed scans collapse settings into the scope, check count and revision summary.

Selected kinds and groups have a checkmark. A present, unselected kind or default-off group remains available. Empty kinds retain keyboard focus with a zero count and n/a explanation; withdrawn checks are absent. Publication metadata remains available by default, switched off. Vocabulary tags describe the census; the withdrawal count opens the names and reasons of the omitted checks. While scanning, all four rows remain visible and unavailable. A failure keeps the settings and Run scan alongside its reason.

Findings group into one band per rule, carrying its severity glyph and word, name, identifier and count, or into one band per entity. A rule gets a band only when it has findings to list, so a rule that found nothing, or whose findings a filter hides, does not appear; Coverage still lists every check that ran (#62). The severity and Suppressed chips, the text filter, and the group, rule, kind and namespace filters under **More** narrow the list. Pages hold 40 findings and run over the findings actually listed, so a collapsed band contributes nothing. A finding's detail shows its rule, basis, entity, statement evidence, what Axiom currently displays, the consequence, the correction, the statements a correction would add, and the other rules the entity appears under. A suppressed finding's detail leads with its exception reason and when it was recorded.

Closing and reopening the pane during the session retains its filters, expanded bands, page, open detail, settings visibility and unfinished label review. Opening Rules and returning to results restores the previous scroll position; a remounted pane restores it after the docking host has been measured. Tools still explicitly opens the scan settings, while View retains the chosen presentation.

Coverage lists each enabled check with its applicable, present, missing and suppressed counts. Every percentage sits beside its denominator, and not applicable is shown as a different fact from zero missing.

The pane reads the shared pane measurement, with its 600 and 400 pixel thresholds and 616 and 416 pixel exits. Narrow folds the finding's entity kind and IRI into the name cell and withdraws the store line. Shallow withdraws the limits line; all four expanded settings rows remain available through the scrolling body. Below 240 pixels wide or 120 tall the pane shows its name, its last result and an instruction to widen, with the shared Maximize pane action. The limits statement has a 440 pixel measure. The status line accounts for named and defined classes within its total instead of repeating an unexplained class count.

The tools bar stays one row, 36 CSS pixels high. **More (...)** remains reachable as commands run out of room. Group by, text filtering and Export move there first, followed as necessary by Suppressed, the Findings/Coverage switch, active-filter clear controls and lower-priority severity filters. Actual control widths determine what fits, including longer counts, namespace filters and pane zoom. Controls return when space grows. Filtering, grouping, suppression and the selected view stay unchanged during resizing; both completed and canceled-partial findings keep their appropriate controls. Escape closes the popup and returns focus to More. A control that moves while focused also returns focus to More. This is Craig's approved exception to #44's clipping reference, implemented under #46; the pinned HTML remains unchanged.

## Findings, evidence and exceptions

Details navigation is guarded by the report's dataset/revision; a stale report says so instead of navigating.

Coverage reports distinct applicable and affected entities, not-applicable entities, and disabled checks. The report separately counts suppressed findings. These totals avoid treating findings as entity counts.

An intentional exception requires a reason. It is stored in workbench preferences outside ontology RDF, keyed to the ontology identity, exact entity, rule and a fingerprint of the finding's evidence and policy. Fingerprints recorded before the profiles were removed still match. Changed evidence/policy must be reviewed again. Show suppressed findings or use **More > Recorded exceptions** to remove an exception. Exceptions survive normal application restarts and source reloads.

Export JSON or CSV through the native save dialog. Export includes all findings, even when filters or pagination hide rows, together with configuration, revision, scope, coverage, the vocabulary census, import notes and exception reasons. A stale report remains an export of its recorded revision and is marked as stale. A scan with no checks enabled is marked as not a clean result. A canceled/failed scan cannot be exported as complete.

## Reviewed label additions

For a missing-label finding in a completed, current report, **Apply** beside **Would add** writes exactly the displayed statement as one undoable edit. It refreshes affected findings and coverage, removes the resolved finding and focuses the next available row. The report remains current for another correction. A rejected write leaves the detail open with the reason. Undo makes the report stale like any other external edit. See `docs/issue-63-validation.md`.

Select **More > Review missing labels** for a completed, current report. Review the identifier-derived candidates, select the desired entities, and edit their labels, predicate or language. Entities with a blank or conflicting existing label are listed but cannot be selected; edit those in Details. Select **Preview selected additions** to see the exact statements, including datatype and graph.

Applying the preview adds the selected labels in one undoable edit. There is no 100-statement cap. Established and placeholder identifiers are preserved; this path does not run the normal placeholder-renaming behavior. Existing annotations are retained. A single-source-graph entity receives its label in that graph; entities described across multiple graphs receive the addition in the default graph, which is visible in the preview.

Every apply is guarded by dataset, revision, and the exact active preview token. Intervening edits, replaced previews, invalid batches, duplicate selections, and repeated application are rejected before mutation, and the pane names which one fired. Only scanned missing-label entities in the editable Store are eligible.

The displayed statement evidence and preview preserve literal control characters through escaping, including Windows line breaks, and keep identifiers ending in a dot as full IRIs. RDF round-trip tests verify that the displayed statements preserve the subject, predicate, literal, language, datatype and source graph.

## Text Analysis compatibility

The issue #38 investigation found that Industrial Safety had no asserted label or synonym; its displayed name was synthesized from the IRI. A missing-label rule therefore reads statements, never the display fallback. Text Analysis eligibility is derived from the existing concept-map function. An entity with a supported alias but no primary label receives a completeness finding without an incorrect exclusion finding.

The scanner does not change matching. Literal rdfs:seeAlso synonyms are reported as a legacy convention; legitimate resource links are not classified as those aliases. No predicate migration is performed. Raw identifier matching limitations, logical consistency reasoning, semantic truth assessment, and remote link verification remain separate concerns.

## Validation

Functional cases are in `tests/domain/ontology-quality.test.ts` and `tests/e2e/ontology-quality.spec.ts`. They cover the Industrial Safety case, all rule triggers, kinds/identifier forms/languages/named graphs, configured predicates, the vocabulary census, settings saved under profiles and old group names, fingerprint compatibility, reference and import scope, cardinality, identity collisions, exceptions, complete and stale exports, revision races, cancellation with partial findings, failure, the no-checks state, named apply rejections, and 137 additions with Undo/Redo. Desktop cases exercise native menus, both stale reasons, filtering, grouping by entity, exact Details navigation, persisted exceptions, exported files, pagination, stale previews, dark detached panes and accessibility.

`tests/e2e/quality-visual.spec.ts` compares the real pane with the pinned reference at zero differing pixels in both themes. `tests/fixtures/quality-visual/README.md` describes the method, the presentation-fixture data and every amendment made to the reference at capture time.

Issue #65's pre-scan presentation supersedes the older reference in that region. `tests/e2e/quality-settings-visual.spec.ts` compares the revised settings, idle body, status and withdrawal popup in both themes, and verifies retained rail positions, focus scrolling, running, failure and recovery. See `docs/issue-65-validation.md` for the reference hashes and comparison scope.

Performance measurements are separate: `node --import tsx tests/performance/ontology-quality.ts [ontology-file]`. They record synchronous snapshot time, complete scan time, scheduling gaps, cancellation and memory without asserting machine-dependent timing thresholds. The scanner is a deterministic review tool, not a proof that an ontology is correct or complete.

Research and the original acceptance criteria are recorded in GitHub issue #42; the pane's current requirements are in issue #44. No new runtime dependency is required for the scanner.
