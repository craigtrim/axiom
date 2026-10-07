# Issue 66: one Windows title band

Windows now uses the reference's 36 CSS pixel band: app mark, eight naturally sized menu triggers and a document pill. Native caption controls retain their real environment-variable reservation. Light, Dark and System changes update the overlay color and symbols alongside the renderer.

The in-page popups use ContextMenu and read the installed Electron menu's labels, access keys, enabled and checked states, recent files and accelerators. Invocation rechecks the current item and its label before execution. Long popups scroll within the viewport. The folder, full menu bar and pill withdraw at 1100, 820 and 620 CSS pixels respectively. The minimum window remains 840×600; actual Electron zoom commands reach the compact states.

Bare Alt, Alt plus an access letter, F10, arrows, Home/End, Escape, Tab and disabled-item focus follow the reference. A remapped menu keeps the correct roving tab stop. Detached panes carry their document URL through the shared bridge so F10 opens the native popup in the correct window. The full native title remains unchanged, and the pill's dirty marker follows save and Undo.

Source-build validation on Windows, 7 October 2026:

- TypeScript passed and all 12,033 unit tests passed across 115 files.
- Four chrome desktop cases passed: both visual themes, all eight click/Alt/F10 entry paths, contents/state/accelerators, disabled items, compact submenus, long-menu scrolling, palette, theme overlay calls, save/Undo, shortcut remapping, actual zoom and detached F10 ownership.
- The existing native Windows Alt/F10, dialog access-key and keyboard context-menu journey passed.
- Fourteen screenshots matched the pinned reference with zero differing pixels: the band at 1380, 1100, 820 and 620 pixels, File at 1380, and compact popups at 820 and 620, in both themes. The visual data includes a real loaded filename, folder and dirty marker.

Reference provenance and the exact allowed data/native-overlay substitutions are in `tests/fixtures/window-chrome-visual/README.md`. Results and images are under `artifacts/issue-66/`. No screenshot masks or tolerance were used.

The final packaged build passed all four chrome cases, including the fourteen exact comparisons, and the updated document-pill/palette journey. All 21 entity context-menu cases passed after restricting the popup-container focus target to chrome menus; entity menus retain their previous item focus behavior. The Touchpoints assertions were also reconciled with its existing region and query controls. Combined verification and the older desktop failures are recorded in `docs/issues-63-65-66-validation.md`.
