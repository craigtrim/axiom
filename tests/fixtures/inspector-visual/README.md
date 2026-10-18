# Inspector reference

Issue #89 owns this specimen. The HTML retains its published bytes from https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/89/visual-reference.html. SHA-256: `8cbf4bb2ba402c3a2a874284c89fdb0b9cf8454a70f7634499c17fc954e562a9`.

`inspector-reference-fixture.ts` extracts the six subjects and their statements into a real Turtle document. It adds the required `owl:DatatypeProperty` declaration for credits, as recorded on the issue. Each test opens a fresh profile with that file through the production file command and uses the real worker.

`inspector-visual.spec.ts` compares all 22 published states in both themes. Expected images come only from the pinned HTML. The reference's recorded recovery-track and narrow-column corrections apply. The fixture maps full IRIs, resource display names, usage counts and real inferred values, and includes the credits declaration using the reference's own row markup. The predicate menu uses the store's available predicates in the specified order. Name and label agree in the invalid-name frame. Maximize uses the application's spelling. The crop excludes the shell's straight group corners from issue #87.

Both renderings use device scale 2, as the published frames do, with sRGB output and LCD text disabled. The pane occupies the same viewport coordinates in each window. The capture setup gives each pane, input, kind pill and SVG its own compositing surface, and gives visible menus the same transform hint. These capture-only settings apply equally to the application and specimen. Screenshots retain device pixels and compare all four bitmap channels without masks or a color tolerance. Measured layouts include the focused control's computed styles.

Run `npm run build`, then `npx playwright test tests/e2e/inspector-visual.spec.ts`. PNG pairs, raw bitmap differences and measured layouts are written to `artifacts/issue-89-visual`; `AXIOM_VISUAL_OUTPUT` can select another output directory. The behavioral suite is `inspector-reference.spec.ts`.
