# Shared seeAlso warnings — 2026-10-06

Craig's revised requirement supersedes the duplicate/name-match withdrawal behavior in EXT-41 and the corresponding completed #56 audit. The original reference HTML remains unchanged as historical evidence. Synonym remains available for valid plain text, including name matches and existing values. Values shared by different entities are allowed.

## Behavior and scope

- Find writes the query as `rdfs:seeAlso`, including when it matches the selected name or another entity's value. Repeated identical RDF literals on the same entity are idempotent; case variants and tagged/untagged literals can coexist.
- Details and Find creation fields display an amber outline and accessible triangle while editing or displaying a shared value. Clicking the triangle lists other matching subjects with labels and IRIs and explicitly permits keeping the value.
- Text matching uses Unicode NFC, lowercase and trimmed edges. Language and datatype annotations do not partition this string advisory. Resource IRIs use exact comparison and are distinct from literals. Same-subject values, labels and other predicates are excluded.
- The predicate index is built once per Store revision. Typing uses a 100 ms debounce and ignores stale replies. Lookup failure does not block editing or saving. Results report the full count and list up to 20 other subjects.
- Individual dismissals use ontology identity, subject IRI and normalized value, independent of statement row position. Global opt-out affects this warning type only. Both persist in personal preferences, survive restarts, and can be reversed under Edit > Settings > Warnings. Workspace files cannot override another user's warning choices.
- Warnings do not modify triples, create Undo entries, or mark otherwise valid data as invalid.

## Validation

Evidence is saved under `D:\git\axiom\artifacts\seealso-warnings`.

The focused domain tests cover cross-entity matches, label/predicate exclusions, own-subject exclusion, language variants, case-sensitive resource IRIs, idempotent writes, Undo/Redo invalidation, index reuse, bounded response counts and preference validation.

The Electron tests exercise editing and saving duplicates, Find's persistent Synonym action, creation with a shared value, both dismissal scopes, restart and workspace-load persistence, restoration through Settings, out-of-order and failed lookups, keyboard Escape/dismissal, accessibility, popup geometry, and detached panes at 150% zoom. Screenshots are captured in light and dark themes and for creation and settings.

Existing Details and Extend reference image suites remain unmodified. The old Find and Extend behavior assertions have been updated only where Craig's new requirement replaces withdrawal with a persistent action.

- `npm run typecheck`: passed.
- Full Vitest suite: 109 files, 12,043 tests passed. A subsequent long-annotation dismissal test and final preference-size guard were checked with all 12 preference/warning tests passing.
- Broad Electron regression run: 76 passed; one test still expected Synonym to disappear after a successful write. Its expectation was changed to require four folded-menu choices with Synonym first, matching the new requirement.
- Packaged application: all 18 warning, grouped-field and reference screenshot tests passed, followed by all three focused Find tests, including the corrected folded-menu expectation.
- Screenshot review caught and corrected inherited button-width styles in the warning popup and checkbox alignment in the Settings dialog. Popup geometry is checked explicitly; its actions stay inside the viewport at 150% zoom in a detached pane.
- After the final checkbox alignment adjustment, the installer was rebuilt and all six warning tests passed again on the packaged executable, refreshing the gallery screenshots.

The final installer metadata, hashes and final packaged warning rerun are recorded in `D:\git\axiom\artifacts\seealso-warnings\validation.json`. `review.html` in that directory presents the screenshots.
