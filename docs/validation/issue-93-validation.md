# Add entity validation

Issue #93 replaces Add entity's frame stack with one form for a class or individual. Parent chips and recursive draft rows share one atomic store transaction. Find's class and individual actions open this form; object, data and annotation properties retain Find's inline editor. Its type selector is limited to those three property kinds.

The view uses the shared palette, action row, menu, footer and recovery rules. It retains its name, kind, comment, statements, parent branches and unfinished picker text through layout changes, detaching and saved-workspace restart. The source preview is keyboard focusable, and copying uses the native clipboard bridge.

## Transaction and persistence checks

Seventeen domain cases exercise recursive creation, occupied IRIs in every statement position, whole comma-bearing aliases, default parents, rollback, language-tagged values, individual types and saved draft validation. Parsed RDF/XML from the preview is compared with the triples actually written. Malformed literal language and datatype metadata are rejected before restoring the source preview.

Validation and creation both guard the dataset epoch and store version. A Create pressed during a name check waits for that check, including its default-parent result. Stale replies cannot commit. A create response preserves edits typed after submission. A failure in any drafted ancestor leaves the whole ontology unchanged; one Undo removes a successful transaction and Redo restores it.

## Visual comparison

The pinned reference has SHA-256 `ce08b87e5c0fa31a9621984d9fabc77ca61046561deaf5c464ee7dd14a341651`. The visual suite compares all 28 published states in both themes at their specified sizes. It requires equal image dimensions and zero differing raw bitmap pixels. It does not mask pixels or allow color tolerances.

All 56 Add entity comparisons pass with zero differing pixels in the final run.

The fixture README records the issue's reference corrections and capture method. The reference remains unchanged on disk. The footer uses the real store total, and picker rows come from the shared ranked search specified by the issue. Reference and application captures use matching paint boundaries in the same native renderer.

Find's eight empty-result comparisons now show its existing Add entity button at wide, narrow, shallow and extra-wide sizes in both themes. Its result-list comparisons retain their existing reference snapshots. The former inline class-editor images are superseded by the new form's 56 states.

All 18 Find visual tests pass, including zero raw differences in the eight updated empty-result images.

## Functional verification

The source branch passes TypeScript, the production build and 11,996 unit tests. The unit suite skips 182 optional native cases in the isolated worktree. Desktop validation supplies the installed Mutatoc runtime and exercises native matching; Find also verifies the installed MPNet model.

All 153 distinct behavior scenarios have passing results across the full runs and targeted rechecks: 11 Add entity cases, 18 adaptive Find cases, seven Find handoff cases, 43 Find integration cases and 74 Text Analysis cases. They cover keyboard interaction, accessibility, current and stale replies, aliases, every property kind, graph navigation, title casing, Undo/Redo, detached windows and restart.

The retired assistant and frame-stack interactions are replaced by recursive-form coverage. A highlight assertion now uses the canonical name derived from the required PascalCase IRI. The detached-form test waits for the native window's resize and recovery transition to settle before reading its fields.

Reproduce from a built checkout with the local Mutatoc runtime supplied through `AXIOM_MUTATOC_HOME`:

```powershell
npm run typecheck
npm test
npm run build
npm run test:desktop -- tests/e2e/add-entity-reference.spec.ts tests/e2e/add-entity-visual.spec.ts tests/e2e/find-redesign.spec.ts tests/e2e/find-adaptive.spec.ts tests/e2e/find-visual.spec.ts tests/e2e/find.spec.ts tests/e2e/text-analysis.spec.ts
```

Logs and native evidence are retained in `C:\Users\Craig\AppData\Local\Temp\axiom-epic80`. The workspace format retains version 1 with an optional validated Add entity draft. Existing workspaces need no migration. This change does not deploy a release or call an external assistant.
