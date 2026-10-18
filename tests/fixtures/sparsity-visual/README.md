# Sparsity reference fixture

The HTML is the unmodified reference attached to craigtrim/axiom#90. Its SHA-256 is `42e0347a12409a68857d44911f9e8e963c066ed4d5f553fa3dd3549688b18f6c`. Git preserves its LF bytes.

`fixture.ts` evaluates the reference's seeded taxonomy and independent calculation in a Node VM. It emits real Turtle containing all 467 named classes, original labels and parent edges. Numeric local names follow the seed's creation order. The reference contains contradictory sibling order constraints: Social Policy 3.3 puts Social System 4.2 before Social Measure 4.1, while Social System 3.1 reverses that pair. A global RDF local-name sort cannot satisfy both. The Business baseline used in the screenshots retains the reference order; other ties follow the application's store order as decision 12 requires.

The domain tests compare every candidate's direct count, discounted count, peer means and score at all five influence settings, for the whole taxonomy and Business. At the default settings the whole taxonomy has 205 sibling groups, 769 measured candidates, 51 unscored candidates and 4 excluded comparisons. The 90 visible bands and 144 findings occupy three collapsed pages or six expanded pages.

The native visual tests open that Turtle through File > Open and use the real worker. A separate renderer computes the expected state from the pinned HTML. Its DOM is then rendered in a shadow root inside the same pane rectangle, with the same theme, font and device scale factor of two. The comparison decodes both screenshots and requires equality at every pixel, including alpha. No area is masked and no color tolerance is applied.

The harness applies the issue's specified recovery, band, toast and paging corrections. It maps finding selection to pressed buttons and uses the shared Maximize spelling. A focused menu item uses the reference's `data-active` token, matching SharedMenu. These are semantic mappings; geometry and color rules remain those in the pinned reference.

Run `npm run build`, then `npx playwright test tests/e2e/sparsity-visual.spec.ts`. The 46 frame pairs and comparison diagnostics are written under `artifacts/issue-90`. Behavioral checks run with `npx playwright test tests/e2e/sparsity.spec.ts tests/e2e/sparsity-reference.spec.ts tests/e2e/entity-context-menu.spec.ts`.
