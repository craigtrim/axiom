# Find entity extension visual contract

The current contract is revision 3: see `README-v3.md` for the user-approved
remembered-action split and the narrow layout amendment. `visual-reference-v3.html`
and `v3-light.json` / `v3-dark.json` are its independent source and expected images.
Current evidence goes to `artifacts/remembered-extend`. The history below describes
the preserved revision 1 and revision 2 artifacts.

`visual-reference.html` preserves the original issue 49 reference byte for byte.
Its SHA-256 is `ccf5025880e27b2536c483574d533b5e58d3f2a032c59d84a95963d0ee55a881`.

`visual-reference-v2.html` is the issue 56 revision, also available in the local
source tree at `D:\git\axiom\specs\extend\visual-reference.html`. Its SHA-256 is
`e7dda85e59b560b5cb6879120d1fdfd9e2ae35a1efcb0dd97b28e747284bfaa8`.
`README-v2.md` preserves the revised normative specification because the local
`specs/` tree is ignored. Git attributes preserve both HTML files' bytes. Each
visual run verifies both hashes.

Revision 2 corrects invisible inline separators, requires a 24-pixel minimum
action width, wraps long identifiers, and constrains menus to the viewport. It
adds the approved Sibling relation and explicit Sibling/Subproperty contexts.
Expanded exhibits have sufficient width to actually show the split control.
The specification reconciles the 148/44-pixel layout table, folded captions and
the shared pane measurements, and records the recovery, focus and context rules
established by the issue 56 audit. These are deliberate reference corrections;
the original reference remains available for comparison.

`tests/e2e/extend-visual.spec.ts` drives the real Electron Find pane after importing
the small ontology in this directory. A second Electron window independently
renders revision 2. No application markup, styles or screenshots generate the
expected images. `light.json` and `dark.json` store the reference PNGs as base64,
alongside their source hash.

Each theme covers the reserved empty column, engaged split, lone main button,
class/property menus, keyboard focus, five editor context bars, shallow split,
narrow/constrained fold, folded menu and synonym confirmation. The test checks
both Axiom against the fresh reference and that reference against the committed
baseline, requiring **zero differing decoded pixels**. It does not mask pixels,
resample images, or ignore antialiasing differences. Captures must stabilize.

Issue 49 treats the surrounding pane/table dimensions and editor body as
scaffolding governed by issue 34. Reference panes use the existing Find
background, and query/entity text can be substituted. The Sibling and Subproperty
contexts now have their own specimens; menu items are no longer injected during
capture. Captures align origins to integer pixels and use matching compositor
isolation for controls and menu items. This avoids fractional baseline rounding
between a native popup and a static exhibit without changing fonts, colours,
dimensions or relative layout. Menus use a common origin in the native top layer
against a neutral backing so unrelated table text cannot paint through rounded
corners. Live alignment is asserted before isolation. Elements are restored
immediately after capture.

`tests/e2e/extend-audit.spec.ts` separately checks real, unmodified detached
windows: live resizing and zoom, 240 × 210 panes, scrolling keyboard choices,
recovery, long names, outside-click focus, disappearing synonym actions, changed
draft kinds and saved RDF, visible separators, and expanded split targets with
Axe in both themes. Existing Find suites cover the relation matrix, creation,
validation, Undo/Redo, keys, busy states, selection, pagination and retained drafts.

Run desktop suites sequentially on Windows with the repository's Electron,
Playwright and Segoe UI fonts:

```powershell
npm run build
npx playwright test tests/e2e/extend-visual.spec.ts tests/e2e/extend-audit.spec.ts
```

To regenerate expected PNGs **from the independent HTML only**:

```powershell
$env:AXIOM_UPDATE_REFERENCE = '1'
npx playwright test tests/e2e/extend-visual.spec.ts
Remove-Item Env:AXIOM_UPDATE_REFERENCE
```

Never use `--update-snapshots`. Visual captures, computed styles, geometry and raw
difference counts are written to `artifacts/issue-56/visual`; integration captures
are in `artifacts/issue-56`. See `docs/issues56-validation.md` for validation and
the requirement-by-requirement audit.
