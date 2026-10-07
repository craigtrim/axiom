# Details reference (#57)

`visual-reference.html` is Craig's original `details.html`, copied without modification from:

```text
C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\details.html
```

SHA-256: `3387b593125c5ba95e338c3dbdd6e0f8775b4ecf390eebd829d3401476e67e90`.
The `.gitattributes` entry disables newline conversion. Each visual test verifies this hash before launching.

Run on Windows after `npm run build`:

```powershell
$env:AXIOM_TEST_BACKGROUND='1'
npx playwright test tests/e2e/details-visual.spec.ts
```

Set `AXIOM_TEST_EXE` to the packaged Axiom.exe to test the delivery build. The tests use isolated profiles and import a real ontology with Technical Algebra and the reference's statements and ancestry. No source or entity API is mocked.

Each comparison freshly renders the app and the unchanged reference in separate windows of the same Electron instance, at 100% scale. The fixture controls the host rectangle, theme, revision, draft text, and parser diagnostic data. The reference's toy parser cannot emit N3's diagnostic, so its invalid-state error is set to the known N3 diagnostic for the actual invalid input. The app's invalid state is produced by pressing Save source. Its stale state is produced by an independent conflicting ontology edit and a refused Save source.

The 64 comparisons cover clean, pending, invalid, and stale in light and dark at 1100×660, 360×680, 1100×260, 360×260, 1100×100, and 230×260. Expanded and narrow panes are also captured with their bodies scrolled to the source. The host tab strip is excluded as required by #57; the entire visible pane is compared, including its native scrollbars.

There are no image masks, app-generated expected images, or pixel-count allowances. Every channel of every pixel must match within 2/255; this accommodates observed independent-surface rounding at antialiased corners. Bounding boxes, fonts, foreground/background colors, and padding are compared exactly for visible header, ancestry, table, input, source, note, and footer elements. Raw differing-pixel counts, maximum channel differences, and layouts are saved for inspection. Two consecutive identical captures are required on each surface.

The reference's actual narrow layout has horizontal overflow and clips long header state/action combinations at very small widths. Those are retained: #57 expressly makes the rendered reference authoritative over prose about appearance.

Evidence is written under `D:\git\axiom\artifacts\issue-57`: paired `*-app.png` / `*-reference.png` and `*-layout.json`. There are no baseline updates to accept after a visual failure; fix the implementation or explain a proven capture issue.
