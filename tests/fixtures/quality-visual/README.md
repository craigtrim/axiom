# Ontology Quality visual contract (issue 44)

`visual-reference.html` is Craig's authoritative reference, copied unchanged from:

```text
D:\git\axiom\specs\quality\visual-reference.html
```

SHA-256: `9eee75ead939e8c1e21a3bd9e23cf756091c57edc9006f1d0a239c58e4e79fe6`. Git attributes keep its bytes on Windows checkouts, and every run of `tests/e2e/quality-visual.spec.ts` verifies the hash before comparing anything. The file itself is never edited; the amendments below are applied to a copy of the specimen in memory at capture time.

## Method

Each case launches the real Electron application, loads a generated `courses.ttl`, detaches the Ontology Quality pane, and drives its real controls into the state a specimen shows. Only the quality requests (`qualityCensus`, `qualityStart`, `qualityStatus`, `qualityCancel`, `qualityPreview`) and the snapshot's counts and revision are answered with presentation fixtures; rendering, filtering, grouping, paging, exceptions and the review workflow run through the application's own code.

The specimen is prepared in a separate window, then rendered inside the application's own pane host, in a shadow root that carries only the reference's CSS, at the same origin and size as the pane. The pane and the specimen take turns being visible, so both are captured in one window, one compositor and one position. Three settings apply to both sides equally:

- Software rasterization (`--disable-gpu-rasterization`), so a busy layer and a simple one antialias paths the same way.
- `overflow: hidden` on each `.body`, so neither side paints a scrollbar or becomes a composited scroller because of how much content it holds.
- Each side is painted once before the captures that count, because Skia caches rounded-corner coverage and the first draw of a shape decides its antialiasing.

A region is scrolled to the end of its body on both sides and captured over the pixels it fully covers, so a region that starts or ends on a fractional row does not bring in a row of its neighbour.

The reference is rendered fresh in every run; there are no checked-in baseline images, and the application is never used as a baseline. Each region must have zero differing raw pixels and the same left edge and width relative to its pane. Expected and actual captures and `*-results.json` diagnostics (pixel counts, positions and per-element layout differences) are written to `artifacts/issue-44`. Setting `AXIOM_QUALITY_PROBE=<selector>` also records computed-style differences for the first match on each side.

## Comparisons

Twenty-three cases run in each theme, so forty-six in all. Whole panes are compared where the specimen is a complete pane in the application's composition: exhibit A's idle, running, canceled and failed states, exhibit G's preview, and the recovery state. Elsewhere the specimen depicts part of a pane (exhibit D shows only a results body; exhibit A's complete state omits the tools bar that exhibit H shows at the same size), so each depicted region is compared on its own: command bars, settings blocks, tools bars, rule bands, finding rows, detail rows, state bodies, coverage rows and notes, limits lines, footers, review rows and the rejection guard.

Dark comparisons use the reference's own dark tokens on the same specimens.

## Presentation fixtures

These are data, not design, and are supplied rather than computed: counts, entity names, IRIs, rule names and identifiers, revision numbers, times, the dataset name, the preview token and the failure reason. The settings enable thirteen admitted rules plus one SKOS and one retired-entity rule, which is what produces "13 checks" and "2 checks are withdrawn".

## Amendments

The reference's exhibits are illustrations, and several abbreviate or contradict each other. These changes are made to the specimen before capture, and nothing else is changed:

1. Rule names and identifiers become the catalogue's: `Missing explicit label` is `Missing explicit primary label`, `completeness.label.missing` is `label.missing`, `Hierarchy cycle` is `Hierarchy cycle or self-link`, and `Excluded from the Text Analysis vocabulary` is `Excluded from Text Analysis vocabulary`.
2. Counts that cannot all hold at once are made consistent with one dataset: exhibit C's and the recovery state's `6,844 findings` become `6,806`, and exhibit A's complete footer also gains the one suppressed finding. Exhibit E's ontology metadata row reports one missing record rather than two, and its sub-lines name what each check tests in the catalogue's words.
3. Every tools bar gains the More button, using Find's More glyph. The settings block's Checks row gains the Rules button.
4. The review screens gain the controls they need: Select all and Cancel on review, Cancel on preview and on the rejection. The failed state's bar gains Change, so the settings that failed can be corrected. The recovery state gains the shared Maximize pane action.
5. Exhibit C pictures a suppressed row that is hidden by default; it is removed. Exhibit F opens a detail under a row that is not marked open; the row is marked open, as exhibit D does.
6. Exhibit D's second figure abbreviates the detail to four rows. The rows it leaves out come from the first figure, for the same entity, so every row sits where the pane draws it.
7. Exhibit H draws its presentations with abbreviated copy and without glyphs. Those figures are exhibit C's pane rendered at H's sizes; at narrow sizes the rule identifier and the bar's Rerun withdraw, as in exhibit A, and at narrow and shallow the tools bar keeps only the severity filter.
8. Exhibit B's census rows are hidden at its own 260 pixel height by the reference's container queries, so they are also compared at 460 pixels tall.

## Running

```powershell
node scripts/build.mjs
node node_modules/@playwright/test/cli.js test tests/e2e/quality-visual.spec.ts
```

Run desktop suites one at a time; simultaneous Electron suites can interfere with keyboard focus.
