# Find visual contract

Issue [83](https://github.com/craigtrim/axiom/issues/83) combines three references. The rendered specimens govern their respective parts of Find:

| Reference | Governs | SHA-256 |
| --- | --- | --- |
| `visual-reference.html` | Find chrome, results, editor surroundings and footer, including the amendments from #36 and #48 | `5fb508df79392f7212bf313127e90ad2787a363ffd24ed5f95309610a32ba73c` |
| `visual-reference-v5.html` | Grouped statement table, following decision 13 | `e2a3a9cc2ee03fd99e8e952db1279063d35f80fd1686eb22fa32e9c06d24f268` |
| `../extend-visual/visual-reference-v3.html` | Row actions, menus and editor context bars | `e70c7d9b72ca40bc5de6812d26a9cd4af97bc1ac378d632d1a62a28bd8e62502` |

The original Find specimen came from Craig's Open Design project. Revision 5 is pinned from the attachment on #83. The source HTML remains unchanged. Tests apply the issue's named amendments in memory: shared palette T1, a 148 px action column at every width (A1), removal of word-match remedies (A2), no empty context line (A3), one selection marker on the leading cell (A4), and Reset filters only off the defaults (A5). The existing `Type` sort remains available because the store does not record change times.

For complete results, the selected row's split is composed from the extend reference. For the editor, only the statement table and its styles come from revision 5. The surrounding editor continues to come from the original specimen. This follows the issue's precedence rules without changing either pinned file.

## Screenshot checks

`find-visual.spec.ts` has 38 comparisons: complete results in Expanded, Narrow, Shallow and Constrained layouts, root and parent-chain creation at multiple sizes and scroll positions, the header action group, exact and normalized collision notices, and the 21-value group. `extend-visual.spec.ts` separately compares the row split, remembered action, menus, focus state, synonym confirmation and all five creation doors in both themes.

The test launches the real Electron application, imports an ontology, detaches Find and uses its controls. Search counts, field catalogues, store totals and reference result rows are presentation fixtures. Functional suites exercise actual search, persistence, creation, undo, semantic refresh, keyboard behavior and draft handoffs. The 21-value example also has a behavioral check for collapse, expansion, source order and removal of the last value.

Expected images come only from the pinned HTML. Every run checks its hash and compares a fresh reference rendering with the checked-in baseline before comparing Axiom. Both renders use the same viewport, Segoe UI fonts, native 1x device scale, grayscale text, sRGB output and SwiftShader renderer. CSS-size captures require no resampling. Matching compositor layers isolate each pane, the More glyph and the result name and metadata text runs. This gives corresponding elements the same paint boundaries at equal origins and avoids rounding differences caused by renderer batching.

The collision notices and 21-value group are captured as isolated components at integer origins on opaque pane grounds. The grouped exhibit inherits Find's 14 px pane typography, as the other inline editor variants do. Its document captions and surrounding exhibit layout are outside the component capture.

Each capture must settle to two consecutive identical images. Playwright uses `threshold: 0` and `maxDiffPixels: 0`; decoded bitmap comparison also includes antialiased edge pixels. Nothing is masked, and application screenshots cannot become expected images. A failed comparison remains a failure.

Run on Windows with the repository's installed Electron and Playwright versions:

```powershell
node scripts/build.mjs
node node_modules/@playwright/test/cli.js test tests/e2e/find-visual.spec.ts tests/e2e/extend-visual.spec.ts
```

After an approved reference amendment, regenerate baselines from the reference:

```powershell
$env:AXIOM_UPDATE_REFERENCE = '1'
node node_modules/@playwright/test/cli.js test tests/e2e/find-visual.spec.ts tests/e2e/extend-visual.spec.ts
Remove-Item Env:AXIOM_UPDATE_REFERENCE
```

The Find suite rejects `--update-snapshots` modes that could accept application output. Evidence includes reference and application PNGs, layout measurements, raw bitmap results and Playwright diffs under `artifacts/issue-34`, `artifacts/issue-36`, `artifacts/issue-48` and `artifacts/issue-83`. The HTML report retains failure traces.

Run desktop suites sequentially because simultaneous Electron suites can interfere with Windows keyboard focus. Unit tests can run independently.
