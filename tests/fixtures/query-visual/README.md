# Query visual reference

This fixture is Craig's version 2 reference for craigtrim/axiom#88, part of #80.
The HTML is committed unchanged, with Git text conversion disabled.

- Source: https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/88/visual-reference.html
- Size: 80,024 bytes.
- SHA-256: `bba0d1c3b3ac1606bea5aa86c78c22cddb0532349f6519808f319c18711b19ff`.
- Published capture script: https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/88/capture.js
- Capture-script SHA-256: `f2c422c0d814dd089c3f3c743f0221798c92ff3a758fd054f8e21fe1517402a4`.

Run `npm run build`, then `npx playwright test tests/e2e/query-visual.spec.ts`.
The suite compares all 32 numbered states in both themes. It renders the app
and reference in the same Electron version at device scale 1, crops the pane
inside the shell, and writes screenshots, layout measurements and pixel counts
under `artifacts/issue-88-visual`. The published images use device scale 2.
The shell tab strip and splitters have their own #87 coverage.

The comparison counts channel differences greater than 2. Five captures have
small measured raster allowances: one light Fields-written pixel at Run's
rounded corner; fourteen light or fifteen dark pixels at the refinement
switch's curved edge after Refresh agents; and two pixels after Open, at
Monaco's left glyph clip and, in light, Run's corner. Each allowance checks its exact
location, channel difference and total count. All other pixels must match.
The report keeps the raw differing-pixel counts; these captures are not
reported as zero-difference images.

`query-reference-fixture.ts` checks the HTML hash before every launch. It loads
the reference's 63 triples as a real Turtle ontology and installs a temporary
Codex executable adapter on PATH. The adapter reports version 0.154.0 and
returns the reference's seeded responses through the production subprocess
runner, proposal parser and validation gate. It does not call a model.

The expected rendering applies the issue's corrections 1 to 7, 11 and 13.
The remaining production mappings are explicit in `query-visual.spec.ts`:

- Real document positions, creation and completion times, parent links,
  history counts, retained rows and their engine order replace mock data.
- The prompt disclosure contains the actual `buildQueryPrompt()` output,
  context counts and discovered executable path. Long paths wrap within the
  composer in both renderings.
- Fields uses the ontology namespace, and validated proposals use Axiom's
  formatter. The production description placeholder is retained.
- Runner errors use the real diagnostic. Refresh discovers a temporary Claude
  Code version adapter. The running frame uses a shared clock at 0.7 seconds
  and retains the existing lock on generation inputs.
- More includes the shipped Format, searchable history and result actions.
  The reference's sign-out simulation is absent from the production menu.
- The History popup contains retained documents rather than per-run snapshots.
  Run toasts therefore say `Added to history.` without claiming a new branch.
- Result cells remain AG Grid cells backed by worker paging. Sorting, column
  statistics and CSV use every retained row.

Behavioral journeys in `query-reference.spec.ts`, `query-authoring.spec.ts`
and `query-results.spec.ts` cover keyboard actions, undo, saved drafts,
generation outcomes, expiry, independent result tabs and full-result export.
