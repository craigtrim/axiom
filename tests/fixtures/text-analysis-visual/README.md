# Text Analysis reference

Issue [#79](https://github.com/craigtrim/axiom/issues/79) supplies this reference. The pinned HTML is 59,091 bytes, SHA-256 `9b03390692b0871189b2120186238921568079afe65ebf7e851aaa55d6542b04`. `.gitattributes` keeps its bytes unchanged.

The desktop comparison opens the HTML in another Electron window. Its sample passage and matcher supply deterministic visual data; the separate native desktop suite exercises Mutatoc, ontology edits, Details, graph creation, and persistence. Monaco remains the application's editor.

The test covers the issue's sixteen states in both themes, plus the narrow editor without its menu at 360 and 300 pixels. The reference's outer dock includes a two-pixel border and a 28-pixel tab strip: a 760 by 560 dock supplies a 758 by 530 pane. Captures compare that pane, excluding shell chrome.

The reference is unchanged on disk. At runtime, the test applies the issue's stated corrections: whole menu labels, full-height recovery, the disabled primary button, and the shared spelling of Maximize. It also applies #81's stronger control borders, which supersede the earlier reference. Both blinking carets are hidden for repeatable captures; the match outline remains visible and is compared.

All pixels must agree within two channel values, except for at most 24 pixels in each wrapped editor capture. Those pixels are the two-pixel corners where Monaco renders separate spans on adjacent lines and the HTML backdrop slices one continuous `mark`. All unwrapped captures have no pixel allowance. Narrow menu captures retain the same corner allowance for the editor visible behind the menu. Dimension differences fail. Each comparison writes both images, layout measurements, and its pixel counts under `artifacts/issue-79-visual`.

Run after `npm run build`:

```powershell
npx playwright test tests/e2e/text-analysis-visual.spec.ts --workers=1
```
