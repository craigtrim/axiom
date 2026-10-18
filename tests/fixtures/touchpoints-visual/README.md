# Touchpoints reference (#92)

`visual-reference.html` is the unchanged reference attached to issue #92. Its SHA-256 is `3bec043bd22ba9aed769651e4fb33bab042d90ee1d6a3058dc42ca7c74280642`. The fixture verifies that hash before use.

The application imports real RDF with the class Journal Article and the individual Marie Curie. Their existing resource statements point to Research and Radioactive decay. Recorded Wikipedia response shapes preserve the reference titles, descriptions, item IDs and disambiguation flags. The initial saved entry has a local fetch time of 2 March 2026, 14:11. Refresh replaces Publication with Learned society, retaining the twenty-candidate limit.

The visual suite drives the real pane and domain worker. Its 23 frames in both themes use the installed local MPNet model, except for the unavailable-model frame. Tests intercept Wikipedia in the main process and send no live request. The oracle receives the actual local similarities and sorts by them, using Wikipedia order for ties.

The reference is corrected in memory for the decisions recorded on #92: shared disabled controls, toast anchoring, wrapping, recovery, spelling, cache dates, duplicate rejection and shipping menu items. Removing simulation items before measuring the menu preserves its right alignment. An unsearched pane makes no ranking claim. The pinned file remains unchanged.

Both captures use the same Electron engine, position, device scale factor of two, color scheme and compositing conditions. All raw bitmap pixels are compared without masks or tolerance. Evidence is written to `artifacts/issue-92`.

After `npm run build`, run the native suites sequentially:

```powershell
npx playwright test tests/e2e/touchpoints-visual.spec.ts --workers=1
npx playwright test tests/e2e/touchpoints-reference.spec.ts tests/e2e/touchpoints.spec.ts --workers=1
```
