# Remembered Find extension actions

Craig requested the labeled action/caret combination remain available in narrow
panes and repeat the last action used. The main button now acts on the current
row and query. Choosing from the caret runs that action and updates the face.
Synonym remains first in the menu, so it can be restored after choosing a relation.

Class and defined-class rows share one preference. Property kinds share another;
individuals and other entities have separate preferences. Choices survive restart
and remain personal settings when a workspace is saved or opened. A temporarily
unavailable action falls back without overwriting the saved choice.

The trailing column reserves 148 CSS pixels in every presentation. Narrow panes
place Type beneath the entity alongside its other metadata, using the existing
measured narrow state. Names and aliases wrap inside their cells. This resolved
horizontal overflow found by the live layout audit with long, unbroken names.

## Requirement checks

| Requirement | Evidence |
| --- | --- |
| Main half repeats the chosen action | Current-row Subclass and Instance desktop checks; saved Subclass RDF names the new row's parent |
| Caret exposes all applicable choices | Class/property/individual matrix, keyboard navigation, restore-Synonym checks |
| Preference is grouped correctly | All three property kinds retain their actual creation type; class memory and individual Synonym remain independent |
| Current query and target are used | Changed query prefill, repeated creation on another row, duplicate Synonym on another row |
| Memory persists without affecting shared workspaces | App close/restart and workspace export checks; load/restore retain personal preference |
| Invalid remembered actions have a safe fallback | owl:Thing excludes Sibling without overwriting it; invalid query and unavailable-subject domain matrix |
| Pending results cannot execute | Held worker reply, disabled halves, forced click and unchanged preferences |
| Keyboard and focus remain usable | Enter/Space, ArrowDown from both halves, menu Escape, editor Back/Escape, actual opening-half focus return |
| Split remains usable at narrow widths | Both themes at 760×558, 500×558, 500×320, 360×558, 240×558; no result-list horizontal overflow and no reveal reflow |
| Zoom and popup geometry | Native resize, 150% pane zoom, minimum pane with zoomed menu, viewport clamping and scrolling keyboard focus |
| Reference styling is retained | Independent HTML comparisons in both themes, including full menu shadows, focus, remembered Instance face, editor contexts and confirmation |
| Duplicate warnings remain advisory | Shared-value editing, repeated Synonym, occurrence/global dismissal, restart, stale lookups and Undo/Redo regression suite |

## Reference provenance

The approved behavior amends the fixed Synonym face and narrow fold in revision 2.
The original two reference revisions and their images are preserved. The new
independent source and contract are in `tests/fixtures/extend-visual/README-v3.md`
and `visual-reference-v3.html`; expectations are `v3-light.json` and `v3-dark.json`.
The local `specs/extend` files also carry the amendment. Expected images are
rendered only from the independent HTML, never captured from Axiom.

There are 16 comparisons per theme, including the reserved blank column. The
30 control comparisons also record full computed styles, geometry, and pixel
difference counts. The other two compare the empty reserved column directly.

## Validation record

- TypeScript passes.
- All 109 domain test files pass: 11,984 tests.
- The broad Find/extension/warning desktop run passed 69 of 71 cases initially.
  Two test setup races started the next action before a file import finished
  resetting the workspace. The Find helper now waits for the File menu rebuild
  that completes import/checkpoint work. Both affected tests pass after that
  correction. The Instance case also passed an earlier isolated rerun.
- The main-action-with-open-menu check passes after ensuring either main or menu
  action closes the popup before entering the editor.
- Final packaged build: **31/31** extension, reference and warning checks pass,
  plus **2/2** import/creation checks. No skips or retries in those runs.
- All **32** reference comparisons pass in light and dark themes with **zero
  differing pixels**. Screenshots from the packaged app were inspected as well.
- The installer was rebuilt at `2026-10-07T02:38:31.466Z` (October 6 locally).
  Installer, executable and application archive hashes, test statistics and
  delivery paths are recorded in `artifacts/remembered-extend/delivery.json`.

Screenshots and the review gallery are in `artifacts/remembered-extend/review.html`.
The desktop suites use temporary profiles and fixture ontologies. They do not
modify Craig's ontology or installed profile. Automated pane zoom and keyboard
checks do not substitute for physical touchscreen or screen-reader sessions.

The delivery target is `D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe`.
