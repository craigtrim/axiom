# Suggestions visual reference

Issue: https://github.com/craigtrim/axiom/issues/82, part of epic #80.

`visual-reference.html` is the unchanged attachment from the issue:
https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/82/visual-reference.html

SHA-256: `89dbb81700c3710da07e8c7fec04238dfd6d928dccec57975a6a03886beba458`.
The test verifies this hash before rendering. `.gitattributes` preserves its bytes.

Run `npm run build`, then
`npx playwright test tests/e2e/suggestions-visual.spec.ts`.

The suite compares all decoded RGBA pixels for frames 01 through 26 and 28
in both themes at the specified viewport sizes and device scale factor 2.
It uses no tolerance or image masks. Actual and reference images are written
to each test's output directory.

The reference is served with the CSS corrections in issue decisions 1 through
10 applied before first paint. This avoids an initial overflowing layout changing
Chromium's retained glyph rasterization. Decision 11 changes the detail heading;
decision 14 adds Open another view to every frame. Frame 28 adds the cache line
and Run again. The 43.5-pixel shell tab strip is blank on both pages because #87
owns that strip. The table's folded detail span and the narrow panel clamp follow
decisions 3 and 5.

The fixture's unsupported overlap note is omitted, as directed by the issue.
Existing-entity fields use `name · IRI`; proposed identifiers use the production
PascalCase function. Normalized names use the existing production normalization
(lowercase words with spaces), rather than the reference's underscore examples.
Menus contain real application modes and assistants, with the reference's
measured widths retained.

`workbench.tsx` renders the production SuggestionWorkbench, ChildSuggestionDetails
and AdaptivePane. Only the service boundary is simulated: deterministic runs,
targets, add results and provider completion. It does not maintain a second
implementation of the view. The compact Context data supplies the reference's
measured frame; Electron tests cover the real recorded context, branch disclosures,
exact prompt, clipboard, persistence, undo and batch requests.

Additional browser tests cover selection across filters, resets and retained sort,
acknowledgement lifetime, keyboard and panel behavior, the view's own width tiers,
shared recovery, cached controls and zoomed panel placement. Electron checks cover
classic desktop scrollbars, both themes, detached windows, accessibility and zoom.
