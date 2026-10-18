# Add entity visual reference

Issue [#93](https://github.com/craigtrim/axiom/issues/93) defines 28 states in light and dark themes. `visual-reference.html` is the unchanged published reference from https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/93/visual-reference.html. Its SHA-256 is `ce08b87e5c0fa31a9621984d9fabc77ca61046561deaf5c464ee7dd14a341651`; the fixture loader checks it before opening an application.

`fixture.ts` loads the reference's class names into the real RDF store. The ontology, property, individual and referenced vocabulary make its initial entity count 45. The footer uses that store count. The picker uses the shared ranked resource search, so the oracle obtains the same current result data instead of using the reference's substring filter. These are data substitutions; the reference supplies the expected layout and styling.

The visual suite drives the native application to each state and renders the published reference in the same Electron engine. It applies the issue's recorded corrections in memory: disabled colors, recovery layout, toast position, current IRI and counts, the established identifier rule and warning, the shipped title-case action, blank Context text, and the implicit Thing parent of a new parent draft. The pinned file is never rewritten.

Captures use the same pane bounds, device scale, color profile and paint boundaries for both views. A shadow root isolates reference styles from application styles. Matching compositing boundaries avoid rounding differences caused by unrelated docked panes; no pixels are masked, recolored or removed. Menu focus, picker focus and stable toast timing are set explicitly. The test decodes both PNGs with Electron's `nativeImage.toBitmap()` and requires identical dimensions and zero differing pixels.

Run after `npm run build`:

```powershell
npx playwright test tests/e2e/add-entity-visual.spec.ts
npx playwright test tests/e2e/add-entity-reference.spec.ts
```

The first command writes actual and expected PNGs, computed styles and raw pixel counts under `artifacts/issue-93`. The second exercises real domain requests, recursive transactions, stale and pending replies, copying, accessibility, resizing, Find handoff and saved-workspace restart. Text Analysis and Find integration also run in their existing suites. Every application owns an isolated profile and ontology fixture.
