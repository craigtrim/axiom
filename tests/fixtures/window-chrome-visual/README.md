# Window chrome reference

`shell.html` is Craig's unchanged reference from:

```text
C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\shell.html
```

SHA-256: `a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f`.

Craig's correction to #66 requires the complete rendered shell: the title band, document pill, menu popups, compact fold, pane rail, document tabs, status bar and command palette, including their keyboard and responsive behavior. The earlier exclusion of the rail, tabs and status bar was incorrect and is superseded.

`tests/e2e/window-chrome.spec.ts` renders this reference fresh in Electron, then captures its header and popup inside an isolated shadow root at the application's origin. The host reproduces the reference body's font, text color and smoothing. Both sides receive the same compositor treatment. Every pixel must match; there are no masks or tolerance allowances.

The in-memory specimen replaces only its illustrative document and menu data with Axiom's live filename, folder, dirty state, menu labels, shortcuts, enabled and checked states. Per the issue, the native caption glyphs are excluded and their fixed 138 pixel reservation is replaced on both sides with the real title-bar environment variables. Popup coordinates follow the actual trigger. Animation is disabled for static capture. Authored reference bytes remain unchanged.

The band is compared at 1380, 1100, 820 and 620 CSS pixels in both themes. File is compared at the wide size, and the eight-menu compact popup at 820 and 620. Functional checks separately exercise all menu entry paths, long-menu scrolling, native theme updates, document save/undo, remapping, zoom and detached F10.

`tests/e2e/workbench-shell.spec.ts` compares the rail, document tabs and status bar at 1380×800, 1100×800, 820×800, 620×800, 620×400 and 1380×420. It also compares stale status and the palette's populated, filtered and empty states, in both themes: 44 additional regions. Raw pixel equality is required for all 58 shell regions. Expected content comes from the unchanged reference, with only real document labels, active pane/tab, counts, revision, save/scan state and installed menu data substituted. The reference host uses the same theme color scheme for native input and scrollbar rendering. No screenshot masks or color tolerance are used.

The reference's explanatory sheet is a placeholder for the working pane area. Axiom's real dockable panes occupy that area. The rail opens those panes; Settings exposes the installed Settings commands. Document tabs select the workspace, its source and visited queries. Badges use real suggestion, quality and audit counts. The stale-scan action opens Ontology Quality and retains the warning until a real scan or valid correction makes it current; the prototype's illustrative click-to-clear state is not used as application data.

Functional checks cover every rail entry, settings focus return, document keyboard navigation, save/Undo, stale scan navigation, 999+ and absent-zero badges, scrolling at short heights, the 620-pixel count withdrawal and both recovery thresholds (239 wide / 119 high).
