# Window shell validation

Issue [#87](https://github.com/craigtrim/axiom/issues/87) was validated on Windows on October 17, 2026, against remote master `77f5f35dae3410ba95637bb27d608d3b0ef8072d`.

That remote revision contained the title band but lacked the complete shell already present in the main checkout. This change brings that existing implementation into the issue branch and applies the reference's remaining requirements. It retains the graph restoration guard and scan freshness behavior, and includes the existing suggestion-history fix that publishes completion only after its result and review metadata have been saved.

The title band, pane rail, document tabs and status bar measure 36, 48, 32 and 22 CSS pixels respectively. The document row uses `--h-doc-tabs`; the shared dock strip retains `--h-tabs` at 28 pixels. The shell declares seven private tokens and no shared overrides.

Tools > Dataset size replaces the example's extra row. Its four supported sizes retain the existing confirmation, cancellation and regeneration behavior. Individual edits can produce another current count; that count remains checked and disabled while the four supported regeneration choices remain available. Other ontologies disable the submenu.

The command palette takes its commands and enabled states from the installed menu. Native menu shortcuts remain suspended while it is modal. Closing it restores focus and releases modal state before dispatching a selected command through the owning window's bridge. Desktop checks cover this behavior in both the main window and a detached pane.

The pinned reference remains byte-identical:

`a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f`

The two visual specs make **110 comparisons with zero differing pixels**: 58 title-band and popup comparisons and 52 rail, tab, status and palette comparisons. Both themes cover all eight menus, the four specified cascades, compact File, Alt cues, disabled Redo focus, focused rail entries and tabs, saved/current status, the scrolled short rail, both recovery sizes, and all three palette states with their scrims. The reference is rendered with live document and menu data. Native caption reservation and the three recorded reference corrections follow the issue. There are no masks or pixel tolerances.

Build and typecheck pass. The full unit run passed 11,917 tests and skipped 182 tests requiring the optional native runtime or embedding model. A final focused run passed all 56 token, keyboard and suggestion-persistence tests. The final desktop checks passed all 17 selected journeys across the visual specs, shell contracts, dataset cancellation, file operations and keyboard navigation. The last two keyboard cases were rerun after correcting their Touchpoints setup and selectors.

The broader desktop run passed 135 of 152 tests. All 17 failures reproduced in a clean worktree at the unchanged base revision. Four obsolete shell expectations were corrected and now pass: the file-title order, the eight-menu inventory, and two keyboard journeys that assumed a default Touchpoints tab. The remaining 13 failures are recorded below. This is not a claim that the full desktop suite passes.

| Existing failing coverage | Cases | Observed failing assertion |
| --- | ---: | --- |
| Query menu cancellation | 1 | `query.cancel` is not enabled within the test's five-second wait. |
| File cancellation | 1 | The test expects the former dirty-document cancellation policy. |
| Native menu coverage inventory | 1 | Eight existing commands lack entries in its outcome map; the new dataset commands are mapped. |
| Graph stylesheet validation | 1 | The expected alert element is absent. |
| Hierarchy inline/context rename | 2 | The expected hierarchy rename row is absent. |
| Individual inline rename | 1 | The expected Alice button is absent. |
| Edge actions | 1 | The expected graph interaction attribute is absent. |
| Saved Find tab | 1 | The test expects Results per page directly in the pane rather than its current overflow menu. |
| Inspector editing, export and detached-window journeys | 4 | The tests expect the former Inspector content and controls. |

Reproduce the shell checks with:

```powershell
npm run typecheck
npm run build
npm run test:desktop -- tests/e2e/window-chrome.spec.ts tests/e2e/workbench-shell.spec.ts tests/e2e/shell-contracts.spec.ts
```

The desktop fixtures use isolated profiles and generated ontologies. They exercise real menu dispatch, dataset mutation, save and undo, scan freshness, focus restoration and detached windows. No migration, service configuration or deployment is required for this source change. Packaging and release publication are separate operations.
