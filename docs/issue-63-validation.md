# Issue 63: apply the displayed correction

The Would add row now offers Apply for a current, complete report. The display and worker use the same statement constructor, including predicate, language, datatype and graph. The worker validates the revision and missing-label finding, writes one undoable annotation, and refreshes the report through the same scanner before returning. This also updates cross-entity duplicate findings and Text Analysis eligibility. Batch review retains its existing workflow.

Success removes the finding, focuses the next available row and permits another correction at the new revision. A rejected write leaves the detail open with the worker's reason. Undo is one correction at a time and makes the report stale, as any external edit does.

Validated on Windows, 7 October 2026:

- TypeScript typecheck passed.
- Ontology Quality domain suite: 197 tests passed, including exact graph/language/predicate writes, fresh-scan equivalence, duplicate effects, successive corrections, Undo and rejection.
- Electron desktop: successive Apply/current revision/focus/last-band removal/Undo passed; rejected correction/detail reason passed; existing reviewed batch and named-graph preview passed.

The report refresh runs in the domain worker. It recomputes all rules to preserve cross-entity correctness; it does not ask the user to rerun the scan.
