# Remembered action amendment — October 6, 2026

Craig approved these changes after reviewing the split button in the reference
and the menu-only plus button in the running application. This amendment
supersedes the narrow fold in revision 2 (EXT-78/EXT-80) and extends the original
fixed Synonym face with last-used action memory.

- The main half runs its displayed action against the current row and query.
- The caret offers every applicable action, including Synonym first. Choosing
  an item runs it and remembers it. Class menus list Synonym, Subclass, Sibling,
  Instance. Property menus list Synonym and Subproperty.
- Keep the labeled main half and caret at narrow widths, reserving 148 pixels
  at rest and when engaged. Retain the original hover, focus, selected-row and
  coarse-pointer visibility rules. Individuals have only Synonym and no caret.
  Narrow panes move Type beneath the entity with its other metadata, using the
  existing measured narrow state. Unbroken names and aliases wrap within cells.
- Persist preferences locally across rows, panes and restarts. Classes and
  defined classes share a preference; all property kinds share another;
  individuals and other entities have independent preferences. A saved
  workspace must not replace these personal preferences.
- An unavailable remembered action falls back to Synonym when valid, otherwise
  the first valid relation. Merely displaying a fallback does not change memory.
  owl:Thing does not offer Sibling. Changing entity kind or query never reuses a
  previous target or creation type.
- Enter/Space runs the focused half. ArrowDown opens the choices from either
  half. Escape closes the menu and returns to the caret; closing an editor
  returns to the actual half that opened it. Pending searches/saves disable both.

`visual-reference-v3.html` preserves revision 2 styling and independent exhibit
markup. Its explicit changes retain the 148-pixel split below 600 pixels, add
Synonym and a separator to expanded menus, use the row name as caption, remove
the obsolete creation-only menu footers, and replace the narrow plus exhibit
with a split. Earlier references and expected images remain untouched.

The source SHA-256 is
`e70c7d9b72ca40bc5de6812d26a9cd4af97bc1ac378d632d1a62a28bd8e62502`.
Historical prose inside the copied exhibit is subordinate to this amendment.
Expected images in `v3-light.json` and `v3-dark.json` come only from this HTML;
the test substitutes Instance for Synonym to exercise a remembered face.
Application images cannot generate or update these expected images.

The visual audit compares pixels, complete menu shadows, typography and geometry
in both themes. The desktop audit exercises actual menus, current-row RDF,
all property kinds, repeated synonyms, memory isolation, persistence, fallback,
stale results, focus, native resizing, pane zoom, and accessible menu controls.
Evidence is written under `artifacts/remembered-extend`.
