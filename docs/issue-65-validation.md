# Issue 65: Ontology Quality settings

The scan settings now use four fixed 32 pixel rows and a separate 36 pixel Run scan action. The rails retain their horizontal position and reveal focused controls without moving the pane vertically. The pre-scan headline, controls, limits and status follow Craig's reference. Empty kinds, selected kinds, available groups and withdrawn checks have distinct presentations. Running keeps every row visible and unavailable; failure retains editable settings and the reason.

References are pinned without content changes:

- `tests/fixtures/quality-settings-visual/visual-reference.html`: SHA-256 `ee21c1b68a1a4ca50053ee368a79ff1031f9c392d820ba470c996181d2e0247a`.
- `tests/fixtures/quality-settings-visual/README.md`: SHA-256 `fe697a974efbadac3915b8ddea157da9bcc40324d6d3b566a285f93e05e9f81d`.

The reference rendering governs where its prose and CSS disagree. Its 440 pixel limits measure, line height and padding are preserved rather than changing them to satisfy the README's conflicting height estimate. The scope/check count summary is retained after scanning. Actual census counts and check names replace illustrative values; status totals derive from the same census as the controls.

Validated on Windows, 7 October 2026:

- All 31 Ontology Quality desktop cases passed, including issue #63 corrections, review, stale guards, exports, named graphs and detached panes.
- Settings behavior passed: focus scrolling, close/reopen restoration, all four unavailable rows while running, failure recovery, completed summary and both recovery thresholds.
- Twelve visual comparisons passed with zero differing pixels: full pre-scan panes at 1180×620, 619×620, 420×620, 1180×300 and 420×300, plus the withdrawal popup, in Light and Dark.

The comparison uses the pinned HTML's CSS and generated markup in an isolated shadow root, with the same viewport and compositor treatment on each side. It substitutes live data and excludes the docking frame outside the reference's pane. It does not mask pixels, relax tolerance or substitute product markup for the reference. Images and numeric results are in `artifacts/issue-65/`.

The final packaged build passed all three settings cases, including the twelve exact comparisons. Combined verification and the older desktop failures are recorded in `docs/issues-63-65-66-validation.md`.
