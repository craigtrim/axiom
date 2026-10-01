# Find visual contract — issue 34

`visual-reference.html` is an unchanged copy of Craig's authoritative file:

```text
C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\specs\find\visual-reference.html
```

SHA-256: `c2a08e67a186ef3fd606b153faf59778962a96e6c56f0d1f7eee8100c9105716`.

The rendered HTML takes precedence over issue 34's older prose. In particular it retains the labeled `Add to the ontology` rule, `follows rdfs:label`, `Create class`, and the simple ancestry line when no parent is selected. The issue's explicit exception remains: the removed word-match mode is not restored.

## Screenshot checks

The test launches the actual Electron application, imports a real small ontology, detaches Find, and edits its real controls. Only the reference's search counts, facet catalogue, suggested IRI and store totals are presentation fixtures. Domain behavior, persistence, validation, handoffs and undo are exercised separately by the functional suites.

The reference is rendered independently from the unchanged HTML. Only exhibit scaffolding and the explicitly excluded word-match remedy are removed. The parent variant comes directly from its `ed-chain` specimen. The app and reference have matching viewport dimensions, fonts, theme, native 1× device scale, grayscale text, and a fixed SwiftShader renderer. Captures use CSS pixel dimensions without a scale transition or resampling. The reference window is shown without taking keyboard focus so packaged Electron keeps it rendering.

The comparison uses `threshold: 0` and `maxDiffPixels: 0`, then compares decoded bitmaps directly. This extra check includes antialiased edge pixels that Playwright's default image comparator can otherwise ignore. Both the fresh reference against its baseline and Axiom against the fresh reference must have **zero differing raw pixels**. Neither images nor their SVGs are masked or replaced.

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

Do not use Playwright's `--update-snapshots` to bless application output. Expected and actual captures, plus measured geometry, are written to `artifacts/issue-34`. Failed comparisons also produce Playwright's diff image.

Run desktop suites sequentially: simultaneous Electron suites can interfere with Windows keyboard focus. Unit tests can run independently.
