# Shared component reference

The unmodified HTML comes from https://dwc-axiom.s3.us-west-2.amazonaws.com/issues/81/visual-reference.html. Its SHA-256 is `076925d259b1ea221a227098f09680cd6f04c0cdb92376e9dfe47714433869e7` (48,322 bytes). Issue #81 also reproduces the file in its first comment.

`design-system-visual.spec.ts` compares the shared components in frames 06 through 20 in both themes, at device scale factor 2. Each comparison decodes both PNGs and requires every channel of every pixel to match. The application side loads the built `app.css` and the reference's specimen page rules. It uses the reference markup and interactions to isolate the stylesheet contract. Expected images always come from the pinned reference's own CSS.

The crops contain the component under comparison. The dock strip, resize grips, headings and explanatory captions are outside those crops. They belong to the specimen page or the shell, whose implementation is tracked in #87. Both sides place the component at the same integer origin. Menu frames compare the popup itself, including its keyboard focus ring.

The in-memory reference corrections are those approved in #81: recovery spans the pane, the toast anchors to it, the state can truncate, disabled primary controls clear their fill, both More buttons draw their icon, findings omit the passed check, and the working pane has its corrected height. The pinned file is never rewritten. The static pane specimen uses the reference's displayed dimensions; the separate behavior tests use `AdaptivePane` and its actual recovery thresholds.

`behavior.tsx` mounts production components in a test pane. The behavior suite exercises natural-width overflow, focus, native popovers, pane zoom, toast replacement and recovery with retained edits. The theme suite launches Axiom, changes its theme through the menu, and checks all 44 stylesheet-owned tokens in the main window and a detached Graph window. The source test separately verifies the verbatim palette and the remaining custom-property owners.

Run from the repository root:

```powershell
npm run build
npm test -- tests/domain/shared-tokens.test.ts tests/domain/quality-overflow.test.ts
npm run test:desktop -- tests/e2e/design-system-visual.spec.ts tests/e2e/design-system-behavior.spec.ts tests/e2e/design-system-theme.spec.ts
```
