# Axiom query history and responsive authoring

The retained-document model was established on 14 September 2026. [Issue 88](https://github.com/craigtrim/axiom/issues/88) replaces its navigation and presentation and makes opening an agent proposal explicit.

## Documents and proposals

Axiom presents one editable SPARQL document at a time. Typing updates that document. New query creates an empty document, selecting an example creates a document from that example, and opening a proposal creates a generated document. Earlier documents remain available, including drafts that were never executed. Creating a document while viewing an older one preserves all later documents.

Generation keeps its response in the main-process service. A completed proposal shows its explanation and assumptions in the composer without changing the editor or creating a history entry. Open in the editor creates and selects the document. Open it for correction does the same for SPARQL that failed validation; Run remains disabled while the document exactly equals the refused proposal. Editing it releases the hold. The query engine still checks every execution.

Unsupported requests and malformed responses create no empty document. Closing the composer or switching its mode preserves the response while the application runs. Opening the same retained response again selects the document already created for it. Generation never executes a query.

A generated refinement records its source document as its parent. A copy recovered from an older results tab records the originating document too. These relationships appear in History as `branched from {n}`. Editing or running a document updates that document's metadata and does not create a branch.

## Actions and history

The pane has one 28 px action row and one 22 px footer. The row contains Run, state text, Compose query, New query, History and More actions. Results adds Columns. When space runs out, Columns, History, New query and Compose query move into More in that order. The remaining actions never wrap. Run, state text and More remain visible, with long state text truncated and its full explanation in a tooltip.

History opens the newest twelve documents, the active document included. Each row contains the first seventy characters of the collapsed query, its position in creation order, creation time, last row count and available parent attribution. Earlier days include a short date. Up and Down move through the popup; Home and End reach its ends; Enter and Space select. Escape and Tab close it and return focus to its opener. Opening an entry focuses the editor.

More contains Run with its Ctrl+Enter hint, Copy results as CSV, Format SPARQL with Shift+Alt+F, and Find a query in history. Example titles appear only for the bundled example ontology. A failed save puts Retry saving first. Find a query in history opens the existing searchable dialog, which searches complete query text, titles and origin information. It displays the newest hundred matches and keeps older documents searchable. The footer reports the current document's position, triple count, last completion time when present and total history size.

Formatting is one undoable replacement of the document. It does not run the query. The editor uses Monaco models with a 13 px monospace font, 20 px lines, one text colour, a 38 px gutter and horizontal scrolling. Each recently visited document keeps its own Undo stack, cursor and scroll position.

## Composer and available space

At measured widths of 860 px and above, the composer occupies a fixed 320 px column at the right of the editor, at every usable height. Its contents scroll independently. Below 860 px it withdraws; Compose query selects Describe and temporarily gives the body to the composer. The same control toggles it closed. Escape, Write into the editor, New query, a History selection and opening a proposal each return to the editor and focus it. The editor remains mounted while hidden.

The composer starts in Fields. Subject class lists every class by label; Predicate lists the predicates present in the ontology, with rdfs:label first and the remainder ranked by statement count. Value contains and the positive whole-number Limit are optional. Write into the editor replaces the document in one undoable edit, using the ontology namespace and the selected terms. Subsequent edits belong to the document.

Describe contains the request, discovered agent and version, Refresh agents, the refinement switch and the actual prompt disclosure. A preview retains its last context while a replacement loads. An immediate Generate waits for the context that matches the current description and ontology. Changing the pending intent or closing that narrow form cancels the waiting click. Once a subprocess is running, closing the form or changing mode lets it continue. Cancel generation terminates the process tree and waits for the reservation to be released.

Describe owns the elapsed-time and cancellation row. Query has no additional assistant band. Its shell tab retains the activity indicator. Outcomes appear in a polite status region that scrolls into view. Generation failure shows the runner's diagnostic and Try again; proposal refusals explain why the gate rejected the response.

Shallow panes withdraw line numbers while retaining the editor and the composer at sufficient width. Shared recovery thresholds show Query's identity, the retained-work explanation and Maximize pane. Models, drafts and results survive that presentation change.

## Results and freshness

Every execution has an immutable record with the exact SPARQL, source document, ontology, completion time, summary, dataset epoch and application session. Each run opens a separate numbered Query results workbench tab. Results survive closing Query and can be moved or detached independently. Their footer identifies the source document and execution time.

Run, Compose query and New query in a results tab act on the active Query document and show Query. History opens in the results tab and selects a document in Query. More contains Open query and Send results to graph. Open query selects the source when its content is unchanged; otherwise it creates a recoverable copy of the executed text without replacing the newer draft. The context line shows the executed text, time, row count and visible-column count. Narrow panes keep the text alone.

The AG Grid infinite row model pages retained rows from the worker. Sorting and column statistics cover the entire retained result. Numeric literals sort numerically, ties retain execution order and blanks stay last in both directions. Columns opens a persistent checkbox popup with fill and distinct-value reasons. Initially filled columns are shown; at least one column remains visible. Copy results as CSV copies all retained rows in the current sort and shown-column order, with a variable-name header and RFC 4180 quoting. Query's copy action uses its active document's last result presentation.

A document edited since execution shows `{n} rows, out of date`. Freshness comparison ignores spacing, comments and keyword capitalization, so formatting does not make results stale. A result older than the ontology shows the same state with an explanation that the rows reflect earlier data. A capped result names the 200,000-row limit. A successful zero-row run explains that no statements matched; it is distinct from a rejected run.

Text and execution records persist to disk. Rows use an in-memory least-recently-used cache of eight result sets with a combined target of 250,000 rows, while allowing the newest single result set. After eviction or restart, the tab retains its executed query and says that rows are no longer retained. It neither silently reruns the query nor displays another execution's rows. Named results tabs can be reopened through Tab History.

## Persistence and asynchronous work

Query documents live in `query-history.json` under Axiom's user-data directory, separately from ontology files and layout preferences. The service serializes writes, replaces the file through a temporary file and retains a backup. It does not automatically prune documents. The serialized-text limit is 50 MB and a query is limited to 100,000 characters. Storage failures preserve the draft and expose Retry saving; a corrupt file remains intact and is reported.

Autosave has a 250 ms debounce. Explicit navigation, proposal opening and application shutdown flush pending edits. A proposal arriving before that timer cannot overwrite the last keystroke because generation does not deliver into a document. Opening it first saves the current draft. Monaco retains up to twenty recently used models; Undo survives navigation within that cache but is not serialized across restart or model eviction.

## Verification

Deterministic CLI fixtures exercise the real subprocess adapter, proposal extraction, validation and explicit opening without paid model calls. Desktop checks cover retained previews, cancellation, malformed responses, independent Undo, save failure, history search, restart, freshness, result ownership and responsive focus. Whole-pane comparisons use the hash-pinned reference in light and dark with the issue's approved mappings for real context, documents and query semantics. The opt-in live Codex suite is separate and requires explicit invocation.

The earlier research below informed draft preservation, model ownership and accessible navigation. The current geometry and interaction contract come from issue 88. Desktop checks establish behavior on the tested fixtures; they do not establish a general usability or natural-language accuracy rate.

## Sources

Primary documentation was consulted on 14 September 2026. Product documentation is living material; version information below describes the page observed, not a guaranteed publication date.

1. JetBrains, DataGrip 2026.2, [Find recent queries and files](https://www.jetbrains.com/help/datagrip/find-recent-queries-and-files.html). Draft recovery and query-history distinction.
2. pgAdmin, Query Tool documentation, observed version 9.17, [Query Tool](https://www.pgadmin.org/docs/pgadmin4/latest/query_tool.html). History metadata, persistence and copying to the editor.
3. Microsoft, [Two-pane view](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/two-pane-view). Responsive presentation and pane priority.
4. Microsoft, [VS Code sidebars](https://code.visualstudio.com/api/ux-guidelines/sidebars) and [UX guidelines overview](https://code.visualstudio.com/api/ux-guidelines/overview). Grouped content and action placement.
5. Microsoft, [Monaco ICodeEditor](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.ICodeEditor.html). Model ownership and editor view state.
6. W3C, [Understanding Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Minimum target dimensions and exceptions.
7. W3C, [Understanding Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html). Meaningful keyboard navigation.
8. W3C, [Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Announcing updates without moving focus.
9. W3C, [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Dialog focus, dismissal and focus return.

[^1]: JetBrains, [Find recent queries and files](https://www.jetbrains.com/help/datagrip/find-recent-queries-and-files.html), accessed 14 September 2026.
[^2]: pgAdmin, [Query Tool](https://www.pgadmin.org/docs/pgadmin4/latest/query_tool.html), accessed 14 September 2026.
[^3]: Microsoft, [Two-pane view](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/two-pane-view), accessed 14 September 2026.
[^4]: Microsoft, [Sidebars](https://code.visualstudio.com/api/ux-guidelines/sidebars) and [UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview), accessed 14 September 2026.
[^5]: Microsoft, [Monaco ICodeEditor](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.ICodeEditor.html), accessed 14 September 2026.
[^6]: W3C, [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
[^7]: W3C, [Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
[^8]: W3C, [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
[^9]: W3C, [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
