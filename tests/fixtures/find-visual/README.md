# Find visual contract — issue 34

`visual-reference.html` was copied from Craig's authoritative file:

```text
C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\specs\find\visual-reference.html
```

Issue 36 removes the empty context line from this test fixture. The external original and the files under `specs/` remain unchanged.

Issue 48 explicitly amends the results state: a quiet plus button beside Graph offers a new class; exact-name or proposed-IRI collisions disable it. Row actions read `+ Synonym`. The zero-results reference remains unchanged. These changes implement the approved issue and are exceptions to #34's older reference. The amended HTML is the source for the new result-action baselines; application screenshots are never used as expected images.

SHA-256: `5fb508df79392f7212bf313127e90ad2787a363ffd24ed5f95309610a32ba73c`.

The rendered HTML takes precedence over issue 34's older prose. In particular it retains the labeled `Add to the ontology` rule, `follows rdfs:label`, `Create class`, and the simple ancestry line when no parent is selected. The issue's explicit exception remains: the removed word-match mode is not restored.

## Screenshot checks

The #48 action checks compare the new plus/graph group and renamed synonym button in both themes. These controls are captured at integer origins with matching compositor isolation in both windows, avoiding fractional ancestor-layer rasterization differences. Their dimensions, fonts, paint properties and all raw pixels must agree; nothing is masked or resampled. The four additional baselines come from the amended HTML. Zero-state specimens remain unchanged.

The test launches the actual Electron application, imports a real small ontology, detaches Find, and edits its real controls. Only the reference's search counts, facet catalogue, suggested IRI and store totals are presentation fixtures. Domain behavior, persistence, validation, handoffs and undo are exercised separately by the functional suites.

The reference is rendered independently from the pinned HTML. Only exhibit scaffolding and the explicitly excluded word-match remedy are removed at capture time. The parent variant comes directly from its `ed-chain` specimen. The app and reference have matching viewport dimensions, fonts, theme, native 1× device scale, grayscale text, sRGB output and a fixed SwiftShader renderer. Captures use CSS pixel dimensions without a scale transition or resampling. Each pane must produce two consecutive identical captures before comparison. The reference window is shown without taking keyboard focus so packaged Electron keeps it rendering.

The comparison uses `threshold: 0` and `maxDiffPixels: 0`, then compares decoded bitmaps directly. This extra check includes antialiased edge pixels that Playwright's default image comparator can otherwise ignore. Both the fresh reference against its baseline and Axiom against the fresh reference must have **zero differing raw pixels**. Neither images nor their SVGs are masked or replaced.

**Open verification issue:** one complete packaged run passed every raw-pixel check, but repeat runs have intermittently differed in six edge pixels of the More icon. Matching SVG attributes, computed paint properties and screen transforms are recorded in the geometry artifacts. Changing raster backends, repainting, or keeping Find in the original window has not eliminated the variation. A successful single run does not establish repeatable 100% bitmap equality. Keep this acceptance gate strict while the discrepancy is investigated.

**Issue 36 verification:** all 22 empty-context, result-area and footer geometry comparisons pass against the amended reference. The full-pane comparisons pass in the two shallow frames and fail in the other 20 frames, whose statement editor differs from this older fixture after the grouped-values implementation. An isolated run of the previous EXE against the previous committed HTML and baseline also fails in the light wide frame. These full-pane assertions remain strict and are not skipped or marked as expected failures. The reference baselines were regenerated independently from HTML; application screenshots were not used as expected images. Evidence is under `artifacts/issue-36`.

Eleven cases per theme cover wide, narrow and extra-wide root views and their scrolled footers; shallow creation; and wide/narrow selected-parent chains at both scroll positions. Baseline images are generated **only from the reference**, never from Axiom. Every run verifies the HTML hash and verifies the checked-in baseline against a fresh reference render before comparing the application.

Run on Windows with the repository's Electron/Playwright versions and Segoe UI fonts:

```powershell
node scripts/build.mjs
node node_modules/@playwright/test/cli.js test tests/e2e/find-visual.spec.ts
```

To regenerate reference baselines after an explicitly approved reference change, update the pinned HTML hash and then run:

```powershell
$env:AXIOM_UPDATE_REFERENCE = '1'
node node_modules/@playwright/test/cli.js test tests/e2e/find-visual.spec.ts
Remove-Item Env:AXIOM_UPDATE_REFERENCE
```

Do not use Playwright's `--update-snapshots` to bless application output. Expected and actual captures, plus measured geometry and SVG transforms, are written to `artifacts/issue-34`. Each test also attaches its original reference/application PNGs and raw difference counts to the Playwright report so subsequent repetitions cannot overwrite its evidence. Unstable captures retain the last two images. Failed image comparisons also produce Playwright's diff image.

Run desktop suites sequentially: simultaneous Electron suites can interfere with Windows keyboard focus. Unit tests can run independently.
