# Window chrome reference

`shell.html` is Craig's unchanged reference from:

```text
C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\shell.html
```

SHA-256: `a0f5573c00809578d78a2d75ee39c5993a726a68d28b94ce1582ca31e67f871f`.

Issue #66 covers the title band, document pill, menu popups, compact fold and keyboard behavior. The rail, tabs and status bar are excluded.

`tests/e2e/window-chrome.spec.ts` renders this reference fresh in Electron, then captures its header and popup inside an isolated shadow root at the application's origin. The host reproduces the reference body's font, text color and smoothing. Both sides receive the same compositor treatment. Every pixel must match; there are no masks or tolerance allowances.

The in-memory specimen replaces only its illustrative document and menu data with Axiom's live filename, folder, dirty state, menu labels, shortcuts, enabled and checked states. Per the issue, the native caption glyphs are excluded and their fixed 138 pixel reservation is replaced on both sides with the real title-bar environment variables. Popup coordinates follow the actual trigger. Animation is disabled for static capture. Authored reference bytes remain unchanged.

The band is compared at 1380, 1100, 820 and 620 CSS pixels in both themes. File is compared at the wide size, and the eight-menu compact popup at 820 and 620. Functional checks separately exercise all menu entry paths, long-menu scrolling, native theme updates, document save/undo, remapping, zoom and detached F10.
