# Issue #46: quality toolbar overflow validation

## Implementation

The quality toolbar now allocates commands from their rendered widths and reserves the More button. It keeps a single 36 CSS pixel row. Controls overflow by priority and return automatically as the pane grows. Their order and reference styling stay unchanged when visible.

Group by, text filtering and Export move first; tighter widths also move Suppressed, the view switch, active-filter clear actions and lower-priority severity filters. All displaced functions remain available in More. Filters, grouping, severity/suppression selection and the selected Findings/Coverage view survive resizing. Canceled partial scans still have no Coverage or complete-report export; stale exports retain their reason.

Hidden measurement controls are inert and excluded from the accessibility tree. Moving a focused control returns focus to More. Escape explicitly closes the popup, preserves search text and returns focus to the trigger. Popups stay within the window and scroll at small heights, including detached panes and pane zoom.

## Visual contract

Craig approved this exception in #44. The original and pinned HTML retain SHA-256 `9eee75ead939e8c1e21a3bd9e23cf756091c57edc9006f1d0a239c58e4e79fe6`. Amendment 9 documents the change. The visual harness independently allocates the reference's controls at capture time, using reference DOM/CSS; it does not import production layout logic, accept differing pixels, or use application screenshots as baselines.

## Validation

- Type checking passed.
- Full unit suite: 99 files and 11,661 tests passed, including eight overflow allocation cases.
- Packaged quality suite: 26 functional desktop cases, two layout sweeps (54 width/height combinations across both themes), and 46 exact-pixel comparisons passed against the rebuilt executable (74 tests total). Every visual comparison had zero differing raw pixels.
- Functional coverage includes resize/restore, text and grouping retained across movement, both native exports, all severity and suppression controls, view retention at minimum width, long namespace filters, keyboard focus in both movement directions, Escape, canceled/stale behavior, detached windows, zoom, and keyboard scrolling to commands below the popup viewport.
- Layout coverage is separate: two theme sweeps cover 54 width/height combinations, verifying bounds for every visible command and More and a stable 36 CSS pixel height.
- Light/dark closed-toolbar and open-popup screenshots were visually inspected.

## Delivery

Implementation commit: `5ea1aac` on `issue-44-codex-takeover`, preserving the inherited #44 work. No merge or push.

Windows package completed at `2026-10-04T01:50:18.889Z` with Electron 44.3.0 and verified Mutatoc 0.5.0 (28 files). The package is unsigned.

Logs: `artifacts/issue-46-full-unit.log`, `artifacts/issue-46-typecheck.log`, `artifacts/issue-46-package.log` and `artifacts/issue-46-packaged-validation.log`. Visual comparison images and raw-pixel reports are in `artifacts/issue-44`; overflow and popup screenshots are in `artifacts/testing`.

```text
D:\git\axiom\artifacts\installer\win-unpacked\Axiom.exe
D:\git\axiom\artifacts\installer\Axiom-Setup-1.0.0.exe
```
