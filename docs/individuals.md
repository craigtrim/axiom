# Individuals and Inspector

Individuals computes its columns from the selected class's statements. The Individual column is always visible. Columns shows fill, distinct values, multivalue depth and the reasons a column is initially hidden. All, None and Reset affect this layout; None keeps Individual, and Reset restores computed defaults, order and widths.

Filtering searches shown columns and each subject's local name. Show `rdfs:seeAlso` to search aliases. Class selection scopes the same grid. Blank values sort last in either direction; numeric columns sort numerically. Multiple values show their first value and a keyboard-accessible `+n` popover. Subjects without a label show their local name with an `id` tag.

Drag a header to reorder columns. The chooser also offers Move earlier/later controls on hover or keyboard focus. Drag a separator to resize, or double-click to autofit the current page. Focused separators accept Left/Right (8 pixels), Shift+Left/Right (32), Home (default width), and Enter/Space (autofit). Widths stay between 56 and 720 pixels. Visibility, order and widths are saved per class in the workspace.

Up/Down select rows; Home/End select the first/last row on the page; Page Up/Page Down cross pages. Clicking a row does not move its columns or scroll position. Escape closes a chooser or values popover and returns focus to its opener.

Inspector shows asserted statements grouped by predicate and inferred statements as read-only rows. More than three values collapse behind a count; Add value and Add row append to the subject's draft. The header is the sole save-state area. Apply changes merges the draft in one Undo operation; Discard or Escape abandons it. Changing selection preserves drafts, and typing during Apply remains a draft after that save finishes. Conflicts retain the edit and identify the predicate.

The header's More actions menu offers Rename, Find touchpoints and Copy IRI. Rename edits the label; Enter or blur stages it and Escape abandons the header edit. An individual's usage line contains Referenced by, Inferred axioms and Revision. Class-specific counts appear only on classes.

The reference fixture and its SHA-256 are pinned in `tests/e2e/individuals-visual.spec.ts`. Raw screenshot comparisons cover the grid, chooser, individual and class Inspectors, Touchpoints, and shared tags in both themes at six sizes.
