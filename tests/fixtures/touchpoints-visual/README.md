# Touchpoints reference (#92)

`visual-reference.html` is the unchanged reference attached to issue #92. Its SHA-256 is `3bec043bd22ba9aed769651e4fb33bab042d90ee1d6a3058dc42ca7c74280642`. The fixture verifies that hash before use.

The application imports real RDF with the class Journal Article and the individual Marie Curie. Their existing resource statements point to Research and Radioactive decay. Recorded Wikipedia response shapes preserve the reference titles, descriptions, item IDs and disambiguation flags. The initial saved entry has a local fetch time of 2 March 2026, 14:11. Refresh replaces Publication with Learned society, retaining the twenty-candidate limit.

The visual suite drives the real pane and domain worker. Its 23 frames in both themes use the installed local MPNet model, except for the unavailable-model frame. Tests intercept Wikipedia in the main process and send no live request. The oracle receives the actual local similarities and sorts by them, using Wikipedia order for ties.

The reference is corrected in memory for the decisions recorded on #92: shared disabled controls, toast anchoring, wrapping, recovery, spelling, cache dates, duplicate rejection and shipping menu items. Removing simulation items before measuring the menu preserves its right alignment. An unsearched pane makes no ranking claim. The pinned file remains unchanged.

Both captures use the same Electron engine, position, device scale factor of two, color scheme and compositing conditions. All raw bitmap pixels are compared without masks. Frames 14 and 15 allow at most four differing pixels, each with a maximum channel difference of eight (out of 255); dimensions remain exact. Hosted Windows produced two rounded menu-edge pixels with a maximum channel difference of seven, with the colors reversing between those two frames on the same run. Every other frame still requires zero differing pixels. Frame 14 in each theme deliberately shifts the independent menu reference by one CSS pixel and requires the same comparison to reject it. Evidence is written to `artifacts/issue-92`.

After `npm run build`, run the native suites sequentially:

```powershell
npm run test:desktop -- tests/e2e/touchpoints-visual.spec.ts --workers=1
npm run test:desktop -- tests/e2e/touchpoints-reference.spec.ts tests/e2e/touchpoints.spec.ts --workers=1
```
