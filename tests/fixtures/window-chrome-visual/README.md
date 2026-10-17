# Window chrome reference

`shell.html` is the unchanged reference pinned in [issue #87](https://github.com/craigtrim/axiom/issues/87) and its [hosted copy](https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/87/visual-reference.html).

SHA-256: `a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f`.

Issue #87 covers the complete shell, including the rail, document tabs, status bar and palette, and retains the earlier title-band checks from #66.

`tests/e2e/window-chrome.spec.ts` renders this reference fresh in Electron, then captures its header and popup inside an isolated shadow root at the application's origin. The host reproduces the reference body's font, text color and smoothing. Both sides receive the same compositor treatment. Every pixel must match; there are no masks or tolerance allowances.

The in-memory specimen replaces only its illustrative document and menu data with Axiom's live filename, folder, dirty state, menu labels, shortcuts, enabled and checked states. Per the issue, the native caption glyphs are excluded and their fixed 138 pixel reservation is replaced on both sides with the real title-bar environment variables. Popup coordinates follow the actual trigger. Animation is disabled for static capture. Authored reference bytes remain unchanged.

The two visual specs make 110 exact comparisons across light and dark. They cover all eight popups, File > Open > Recent, View > Theme, Graph > Layout, Window > Move pane, compact File, Alt cues, focused document tabs and rail entries, saved and current status, short scrolled rails, both recovery sizes, and the palette with its scrim in all three states. The band retains its 1380, 1100, 820 and 620 CSS-pixel comparisons. Reference decisions 2 to 4 govern recovery geometry, native caption reservation and the System dark scrim.

`shell-contracts.spec.ts` checks accessible names with axe, the tab-labelled panel, the folderless document pill, dataset confirmation and cancellation, configured motion, System dark, and submenu flipping. The broader desktop suites retain real menu dispatch, live counts, scan freshness, save and undo, remapping, zoom, and detached-window behavior. Both visual specs verify the pinned hash before rendering; no second reference copy is maintained.
