# Details reference (#57)

`visual-reference.html` is Craig's original `details.html`, with #58's authorized removal of the prefix note. The original was copied from:

```text
C:\Users\Craig\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\dd6f8408-986c-4b38-9c30-3fe336496345\details.html
```

Current SHA-256: `0cdd5cc4925e8e808eb1b81ddcc1da9d9dd6ed6d55cde1905a8420c58ecff95c`.
Original, before #58: `3387b593125c5ba95e338c3dbdd6e0f8775b4ecf390eebd829d3401476e67e90`.
The `.gitattributes` entry disables newline conversion. Each visual test verifies this hash before launching.

Run on Windows after `npm run build`:

```powershell
$env:AXIOM_TEST_BACKGROUND='1'
npx playwright test tests/e2e/details-visual.spec.ts
```

Set `AXIOM_TEST_EXE` to the packaged Axiom.exe to test the delivery build. The tests use isolated profiles and import a real ontology with Technical Algebra and the reference's statements and ancestry. No source or entity API is mocked.

Each comparison freshly renders the app and the #58-amended reference in separate windows of the same Electron instance, at 100% scale. The fixture controls the host rectangle, theme, revision, draft text, and parser diagnostic data. The reference's toy parser cannot emit N3's diagnostic, so its invalid-state error is set to the known N3 diagnostic for the actual invalid input. The app's invalid state is produced by pressing Save source. Its stale state is produced by an independent conflicting ontology edit and a refused Save source.

The 64 comparisons cover clean, pending, invalid, and stale in light and dark at 1100×660, 360×680, 1100×260, 360×260, 1100×100, and 230×260. Expanded and narrow panes are also captured with their bodies scrolled to the source. The host tab strip is excluded as required by #57; the entire visible pane is compared, including its native scrollbars.

Issue #85 adds ten comparisons for frames 17 to 21 in both themes: a focused single-value row, a third value just added, five values collapsed and expanded, and a new statement row. The reference receives decision 3's normal tools line for the focused single-value row. Decisions 9 and 11 keep the uncommitted added value out of the source and show Editing in the header. Its initial focus is asserted before Escape dismisses the resource picker; both surfaces are then captured without field focus. A blank predicate row leaves the saved ontology and header state unchanged. Decision 6 replaces the prototype's comment placeholder with the blank predicate chooser, including decision 13's focus ring. These amendments are applied in the test; the pinned HTML remains unchanged.

There are no image masks, app-generated expected images, or pixel-count allowances. Every raw pixel must be identical; there is no color tolerance. Both surfaces receive the same compositor normalization, preserving their geometry, colors and content. Bounding boxes, fonts, foreground/background colors, and padding are compared exactly for visible header, ancestry, table, input, source, note, and footer elements. Raw differing-pixel counts, maximum channel differences, and layouts are saved for inspection. Two consecutive identical captures are required on each surface.

The reference's actual narrow layout has horizontal overflow and clips long header state/action combinations at very small widths. Those are retained: #57 expressly makes the rendered reference authoritative over prose about appearance.

Evidence is written under `D:\git\axiom\artifacts\issue-57`: paired `*-app.png` / `*-reference.png` and `*-layout.json`. There are no baseline updates to accept after a visual failure; fix the implementation or explain a proven capture issue.
