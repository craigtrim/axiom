# Inspector reference validation

Issue #89 replaces the Inspector's earlier header and fields with the published action row, editable Name, usage tiles and grouped statement table. It uses the shared tokens and recovery policy. The reference HTML retains its published SHA-256, and its six subjects load through the production file command into the real worker.

The visual suite compares all 22 published states in both themes, plus eight separate menu captures. All 52 image pairs have zero differing raw bitmap pixels at device scale 2. The fixture README records the capture settings and the issue's permitted RDF mappings. There are no masks or color tolerances. Earlier scale-1 captures intermittently differed at six focused-border pixels across two frames; using the published scale resolved that discrepancy in the full run and eight repeated focused-field captures.

The final source unit run passed 11,949 tests across 117 files. The optional suites skipped 182 tests in two files. Type checking and the application build passed.

The final native regression run passed all 36 tests across `inspector-reference`, `inspector-editing`, `individuals-behavior` and `details-refinement`. They exercise the preferred label and Name together, RDF metadata, one-operation Undo, retained drafts across selection changes, conflicts, workspace Save, usage counts, menus, expansion, overflow, recovery and focus restoration. Controlled delayed requests cover initial draft loading and returning to a subject during Apply. The latter test failed before shared save ownership was exposed to the remounted editor and passed after the fix. Another controlled test holds a delayed Details reveal and verifies that it cannot blur and commit a field the user has already reached.

The shared regression runs also cover Details and Find visuals, the Individuals grid, its chooser and legend, Touchpoints, native clipboard copying, detached Inspector editing, instance counts and source-format round trips.

Three older checks fail on both the unchanged local baseline and this implementation:

- The Individuals keyboard-separator capture differs by one pixel in each theme, at CSS position `(667, 64)`. Application and reference PNG hashes are each identical before and after #89, including those differences.
- The Linked File test expects a region that the baseline does not mount. `LinkedFileCard` has a definition but no caller on the remote base. This implementation does not change that behavior.

These checks remain unchanged; their failures are not counted as passes. Baseline logs and image pairs were retained with the implementation evidence.

To check the feature manually, select an entity and edit Name or a statement. Apply changes should create one Undo step. Type another value while Apply is pending, then confirm that the later value remains a draft. Resize the pane to move actions into More, shrink it into recovery, and use Maximize pane to resume editing. Open in Details should show the same retained subject draft.
