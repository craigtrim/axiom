# Utility view validation

Issue #94 rebuilds Source, Filesystem provenance, Suggestion runs, Error log and Tab history around the shared 28 pixel action row, measured overflow, 22 pixel footer and retained recovery bodies. The views use the shared tokens and components introduced by #81.

## Source and saved evidence

Source keeps Monaco's model, Undo, Find, clipboard commands and selection. Its plaintext model avoids the renderer stall reproduced while typing unfinished XML with XML language services enabled. Automatic bracket insertion and paste indentation are disabled so entered text survives unchanged, including after restart. Its plain palette is scoped to this editor, and its native horizontal scrollbar follows the same viewport. Invalid drafts retain their text and leave the ontology unchanged. Parser failures have an explicit identity for all six supported formats; stale version and workspace guards remain separate.

Validation found that the installed RDF/XML stream parser accepted an unfinished document such as `<broken` as an empty graph. XML completion is now checked before RDF conversion can replace the store. The existing Saxes version is a runtime dependency. Tests reject invalid documents in all six formats without changing the store, including unfinished XML and JSON.

Imported ontologies also exposed a draft-validation defect: generic RDF property declarations could classify labels and comments as resource fields. The shared value classifier now preserves their literal editor contract. Regression tests retain the rejection of unfinished resource values, and lifecycle tests edit the imported labels through Inspector before saving and reopening the workspace.

Provenance counts actual metadata statements, carries each entry's own coverage note and saves the collection identifier in its PROV links. Start over waits for cancellation and worker exit before returning to Ready. It retains the chosen folder and limits and leaves saved partial evidence on disk.

Suggestion runs retains the captured targets, provider and operation when rerun. Cancel marks queued targets as not run and lets the active target finish. Clearing removes the saved batch, suppresses later publication by its active completion and prevents older batches from reappearing in the view. Each failure keeps its own persistent audit reference.

Error log opens one selected entry at a time. It counts complete UTF-8 diagnostic streams before retaining at most 262,144 characters of stdout and the last 8,000 characters of stderr. Headers report truncation; previews show 1,400 characters, while native Copy report includes the entire retained record. Redaction remains in force. A storage failure leaves the record available in memory and disables Show log file.

Tab history shares the retention setting with Settings. Selecting a saved tab and activating it are separate actions. Filtering searches name, type and date. Default names remain listed under Named tabs only, with an accessible refusal explaining the setting. The filter remains usable from the overflow menu at 240 pixels.

## Reference comparison

The pinned HTML remains unchanged at 74,359 bytes with SHA-256 `24ce03774c0951988db376e208360c327798ac03a636360689d94a924e09a7c7`. All 43 published states pass in light and dark: 86 comparisons with equal dimensions and zero differing raw bitmap pixels. No pixels are masked and no color tolerance is used.

The fixture README describes the issue's corrections, measured dimensions and capture method. Reference and application render at the same coordinates in the same native renderer, with equal paint boundaries. Real parser messages, selection, observation counts, queue state and the 120 second timeout replace illustrative values. The source HTML itself is not edited.

Eight utility interaction tests pass. They exercise the action row and footer at widths from 898 to 240 pixels, menu bounds, recovery, source paste and copying, native horizontal scrolling, filter focus and retention, audit preview lengths and native report copying. The final history layout was also checked against its 16 affected reference frames.

Across the broader desktop suites, 157 distinct scenarios have passing results, including all 29 imported-ontology lifecycles, all 22 taxonomy assistant scenarios, saved Find settings, exact Source draft restoration and partial provenance evidence. Fixes were followed by targeted reruns of the failed scenarios. A final recheck of the 30 Source and Suggestion runs reference images and all eight utility interaction tests passed after the last editor and accessibility changes.

## Reproduction

The older Linked File desktop case still fails because the remote baseline does not mount `LinkedFileCard`. This is the same failure recorded in `docs/issue-89-validation.md`; its test remains unchanged and is not counted as passing. The commands below include that case so its result remains visible.

Run from a built checkout on Windows. Set `AXIOM_MUTATOC_HOME` to the installed local runtime when running the broader desktop suites.

```powershell
npm run typecheck
npm test
npm run build
npx playwright test tests/e2e/utility-visual.spec.ts tests/e2e/utility-reference.spec.ts
npx playwright test tests/e2e/source-files.spec.ts tests/e2e/ontology-export.spec.ts tests/e2e/workspace-autosave.spec.ts tests/e2e/details-source.spec.ts tests/e2e/adaptive-panes.spec.ts tests/e2e/number-fields.spec.ts tests/e2e/ontology-lifecycle.spec.ts tests/e2e/hierarchy-multiselect.spec.ts tests/e2e/taxonomy-assistant.spec.ts tests/e2e/tab-history.spec.ts
```

The source branch passes TypeScript, the production build and 12,010 unit tests, with 182 optional native cases skipped in the isolated worktree. Logs and native evidence are retained in `C:\Users\Craig\AppData\Local\Temp\axiom-epic80`. Existing workspaces and older audit records remain readable without migration. Assistant behavior tests use local fixture processes. This change makes no external assistant calls and does not publish a release.
