# Individuals and Inspector

Individuals computes its columns from the selected class's statements. The Individual column is always visible. Columns shows fill, distinct values, multivalue depth and the reasons a column is initially hidden. All, None and Reset affect this layout; None keeps Individual, and Reset restores computed defaults, order and widths.

Filtering uses Find's shared ranked search over shown columns and each subject's local name. Show `rdfs:seeAlso` to search those aliases; hidden aliases and the hidden IRI namespace do not match. Partial words, filler words, misspellings and reordered words work as they do in Find. Lexical results arrive immediately; the local MPNet model adds meaning-based results after typing pauses, when installed. A missing model leaves lexical results usable. Class selection scopes the same grid to direct instances before matching and ranking.

An active query uses best-match order until a column sort is explicitly chosen. With an empty filter, rows follow the column sort, initially Individual ascending. Clicking a header sorts the results and clicking it again reverses the order. Explicit column sorts are saved with the workspace. Blank values sort last in either direction; numeric columns sort numerically. Multiple values show their first value and a keyboard-accessible `+n` popover. Subjects without a label show their local name with an `id` tag.

The generated example's class instance report uses the same ranked search over names, aliases and IRIs. It includes only the selected class's direct named and generated instances, pages at 100 rows, and lists every direct instance when the filter is empty. Both filters keep completed rows visible during replacement searches and ignore obsolete lexical or semantic replies. The hierarchy continues to show classes only.

Drag a header to reorder columns. The chooser also offers Move earlier/later controls on hover or keyboard focus. Drag a separator to resize, or double-click to autofit the current page. Focused separators accept Left/Right (8 pixels), Shift+Left/Right (32), Home (default width), and Enter/Space (autofit). Widths stay between 56 and 720 pixels. Visibility, order and widths are saved per class in the workspace.

Up/Down select rows; Home/End select the first/last row on the page; Page Up/Page Down cross pages. Clicking a row does not move its columns or scroll position. Escape closes a chooser or values popover and returns focus to its opener.

Inspector shows asserted statements grouped by predicate and inferred statements as read-only rows. More than three values collapse behind a count; Add value and Add row append to the subject's draft. The header is the sole save-state area. Apply changes merges the draft in one Undo operation; Discard or Escape abandons it. Changing selection preserves drafts, and typing during Apply remains a draft after that save finishes. Conflicts retain the edit and identify the predicate.

The header's More actions menu offers Rename, Find touchpoints and Copy IRI. Rename edits the label; Enter or blur stages it and Escape abandons the header edit. An individual's usage line contains Referenced by, Inferred axioms and Revision. Class-specific counts appear only on classes.

The reference fixture and its SHA-256 are pinned in `tests/e2e/individuals-visual.spec.ts`. Raw screenshot comparisons cover the grid, chooser, individual and class Inspectors, Touchpoints, and shared tags in both themes at six sizes.
