# Find entity extension visual contract — issue 49

The unchanged source is `D:\git\axiom\specs\extend\visual-reference.html`.
Its SHA-256 is `ccf5025880e27b2536c483574d533b5e58d3f2a032c59d84a95963d0ee55a881`.
Git attributes preserve the fixture's bytes. Each run checks the hash.

`tests/e2e/extend-visual.spec.ts` drives the real Electron Find pane after importing
the small ontology in this directory. A second Electron window independently
renders the reference. No application markup, styles or screenshots generate the
expected images. `light.json` and `dark.json` store the reference PNGs as base64,
alongside their source hash.

Each theme covers the reserved empty column, engaged split, lone main button,
class/property menus, keyboard focus, four editor context bars, shallow split,
narrow/constrained fold, folded menu and synonym confirmation. The test checks
both Axiom against the fresh reference and that reference against the committed
baseline, requiring **zero differing decoded pixels**. It does not mask pixels,
resample images, or ignore antialiasing differences. Captures must stabilize.
Functional tests separately verify creation, validation, Undo/Redo, menu keys,
busy states, selection, pagination, scrolling and retained drafts.

Issue 49 explicitly treats the surrounding pane/table dimensions and editor body
as scaffolding governed by issue 34. Expanded reference specimens therefore use
a width above the shared narrow threshold; several exhibits otherwise fold their
own controls at their supplied widths. The reference pane background uses Find's
existing background. Query and entity data can be substituted. The subproperty
context, which has no specimen, follows the subclass context's structure with the
required words and predicate. Captures align origins to integer pixels and use
matching compositor isolation for the control and menu items on both sides.
This avoids fractional baseline rounding between a top-layer popup and a static
exhibit; it does not change fonts, colours, dimensions or relative layout.
Menus are captured at a common origin in the native top layer against Find's
neutral background, so unrelated table text cannot paint through rounded corners.
The live menu's alignment under its trigger is asserted before isolation. The
original real elements are restored immediately after capture.

The reference's empty inline separator spans render with zero width and height.
The implementation preserves that appearance and provides separator semantics.
The full action-column widths are tested separately as 148 and 44 pixels; table
padding in the scaffolding is not used to redefine those widths.

Integration at the smallest expanded width needs Type and Synonym to shrink:
the 224-pixel facet rail and three fixed 120/180/148-pixel columns otherwise
leave no room for Entity at 600 pixels. Their previous widths are retained as
maximums, with continuous sizing that reserves 80 pixels for Entity. The action
column and shared presentation thresholds stay exact. This sizing adjustment is
also applied in memory to #34's results specimens.

Run on Windows with the repository's Electron, Playwright and Segoe UI fonts:

```powershell
npm run build
npx playwright test tests/e2e/extend-visual.spec.ts
```

To regenerate expected PNGs **from the HTML only**:

```powershell
$env:AXIOM_UPDATE_REFERENCE = '1'
npx playwright test tests/e2e/extend-visual.spec.ts
Remove-Item Env:AXIOM_UPDATE_REFERENCE
```

Never use `--update-snapshots`. Captures, computed styles, geometry and raw
difference counts are written to `artifacts/issue-49` and attached to the report.
Run desktop suites sequentially to avoid Windows keyboard-focus interference.
