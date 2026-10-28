# Hierarchy reference (#91)

`visual-reference.html` is the unchanged version 2 reference published with issue #91. Its SHA-256 is `4d900c2e638462c79a917bf0ba43ad85302ff98cadaa2d5f072b305f66abdbb7`.

`fixture.ts` checks that hash before extracting its 36 classes and 14 properties. It creates actual RDF instances and predicate assertions for every published count. Numeric local identifiers preserve the fixture's sibling order under the app's existing alphabetical ordering; labels supply the published names. Property roots retain the app's alphabetical order. Moving or undoing a branch retains the app's sibling ordering too.

The native visual test opens this RDF through the real application file-launch path and drives the real Hierarchy UI. Setup waits up to 30 seconds for the seed entity to appear before testing the pane, without requesting a save/capture from a renderer that may still be mounting. A failed seed load disposes that isolated application and fails the case. File > Open behavior remains covered by the ontology lifecycle journeys. It compares all device pixels at DPR 2 against the reference rendered in the same Electron engine, at the same position, scale and theme. Popups use Chromium's top layer on both sides. No pixel threshold, mask or screenshot baseline replacement is used.

The reference is corrected in memory for the issue's recovery, shallow-body, toast-anchor, overflow, disabled-menu and property-drag decisions. Totals include roots, the recovery button reads “Maximize pane,” and ordering follows the policy above. Two additional stale displays are corrected as recorded on #91: hover expansion updates the footer count, and the root-drag explanation accompanies the newly selected root. The HTML on disk remains hash-pinned.

Run from the repository root after building:

```powershell
npm run test:desktop -- tests/e2e/hierarchy-visual.spec.ts --workers=1
npm run test:desktop -- tests/e2e/hierarchy-reference.spec.ts --workers=1
```

Images, raw comparison results and measured geometry are written to `artifacts/issue-91`. Run native suites sequentially.
