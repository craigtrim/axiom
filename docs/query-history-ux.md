# Axiom query history and responsive authoring

Research and implementation decision record, 14 September 2026.

## Decision

Axiom should present one SPARQL document at a time. Generating a query creates a new document and opens it in the main editor. The preceding query remains available through Previous and Next. An explicit New query action creates an empty document. A small position indicator opens a searchable history when sequential navigation becomes inconvenient.

The composer contains the request and agent controls. Generated SPARQL belongs in the editor, with its explanation available beside the document. Run remains a separate action. Each executed query opens a separate Query results workbench tab. Its saved execution reference survives closing the editor and remains available when the user moves through query history.

This recommendation combines the requested interaction with established query-history and responsive-pane patterns. It is a design judgment based on product documentation, accessibility guidance and Axiom's existing architecture. It is not a finding from a controlled usability study. The desktop checks verify behavior and layout; they cannot establish how quickly new users will learn the interaction.

## Problem observed in Axiom

The supplied screenshot showed two places containing SPARQL: the main editor and a generated-query preview in the composer. The user had already described a query and waited for Codex, but the editor still contained the previous query. A Use query button introduced another step before the generated text became the working document.

That arrangement created a distinction between a proposal and an editor document that the interface did not explain well. It also used much of the available pane width for a second code presentation. Scrolling through the explanation and preview could move the insertion action out of view. A narrow docked pane amplified these costs.

Replacing the editor automatically would remove the extra step, but would also lose the preceding query unless preservation was built into the document model. Monaco Undo alone is insufficient for that purpose. It belongs to editing within a document and is easy to invalidate through model replacement, window lifecycle changes or application restart.

The revised interaction therefore needs persistent query identity. History is a set of retained working documents, including unexecuted drafts. It is not merely a list of successful executions. That distinction determines the storage, result ownership and asynchronous delivery rules.

## What the sources establish

DataGrip distinguishes query execution history from Local History, which can recover changes made in a console even when those changes were never executed. Its recent-query tools support searching and recovering earlier text. This provides a useful precedent for preserving work before Run, although Axiom does not need to reproduce DataGrip's entire console and file system.[^1]

pgAdmin records query text with execution metadata and persists history by user and database. Its documentation also describes copying a historic query into the editor, replacing the current contents. Axiom can adopt the useful metadata while avoiding that replacement behavior. Its explicit requirement is to preserve the current document when creating another one.[^2]

Neither product establishes that arrows are universally better than tabs. Both are mature query tools serving broader workflows. The relevant evidence is that earlier queries need to remain recoverable and identifiable. The choice of one visible document with arrows comes from Axiom's pane constraints and the user's stated preference.

Microsoft's two-pane guidance distinguishes wide, tall and single-pane presentations, and lets an application prioritize content when both panes cannot be displayed usefully. Axiom uses React and CSS rather than the documented WinUI control, but the interaction principle transfers: available content width should determine whether secondary work stays beside the primary document.[^3]

VS Code's sidebar guidance favors related content, descriptive names and restrained use of views and toolbar actions. Its broader UX guidance assigns controls to the surface they affect. These are useful precedents for keeping generation controls near the query without turning the pane into a second general-purpose chat application.[^4]

Monaco exposes model attachment and serializable editor view state. An externally owned model can survive detachment from an editor. These APIs make it possible to preserve independent undo stacks while moving between queries and to restore cursor and scroll position when a query is revisited.[^5]

Accessibility guidance constrains how discreet the navigation can become. WCAG 2.2's minimum target-size criterion generally calls for a 24 by 24 CSS pixel target, subject to its exceptions. Axiom uses 32-pixel arrow buttons. Small visual emphasis does not require small targets.[^6]

Focus order should remain meaningful when content changes. Status updates can be announced without moving keyboard focus. These principles are particularly relevant when a slow agent completes while the user is editing a different query.[^7][^8]

## Alternatives considered

| Approach | Useful property | Problem for this pane | Decision |
| --- | --- | --- | --- |
| Query tabs | Direct access to several visible documents | Crowds the docked pane and conflicts with the requested interaction | Do not use |
| Replace the current editor with every response | Few controls and immediate visibility | Can destroy or obscure an unfinished query | Reject |
| Keep a generated preview and Use query | Makes acceptance explicit | Duplicates code and requires an extra transfer step | Remove |
| Record only executed queries | Familiar database history | Loses drafts and generated queries that were never run | Insufficient |
| Previous/Next without an index or search | Minimal visual footprint | Becomes slow and ambiguous with many queries | Add position and search |
| One editor with retained documents | Clear working location and recoverable drafts | Requires explicit result and asynchronous-state ownership | Adopt |
| Stack the whole composer above the editor at every narrow width | Both surfaces remain present | Can leave too little height for either editing or results | Use a temporary composer view in narrow panes |

The recommendation does not require every keystroke to become a separate history page. Doing so would make navigation unusable. Typing updates the current document. New query, selecting an example and a completed generation each create another document.

A generated refinement also creates a new document. The source query remains an explicit comparison point, and the user can page back to inspect it. This rule avoids asking users to predict whether a refinement will be a small edit or a substantial rewrite.

## Main interaction

The history strip appears above the action toolbar:

```text
[ ‹ ] [ 3 / 8 ] [ › ]   Classes with American names       [ + New query ]
[ Run ] [ Format ] [ Compose query ] [ Examples… ] [ … ]
```

Previous and Next follow document creation order. Their labels and tooltips identify direction. Buttons disable at the ends of the sequence. The position indicator communicates both the current position and the amount of retained work. Selecting it opens Query history.

New query appends an empty document, selects it and focuses the editor. If the user is viewing query 2 of 8, creating a query makes query 9 of 9. Queries 3 through 8 remain available. This differs from a browser's forward-history truncation and matches the requirement to keep older and newer queries.

Selecting an example follows the same preservation rule. It creates an example document without overwriting the current draft. Example selection is a starting point for authoring, not a global mode that makes all later edits belong to one reusable buffer.

The title provides orientation. Agent-generated queries use the request description. Examples use their supplied names. Manual drafts derive a short title from the first substantive line. Long titles are truncated visually, with the full title available through the existing tooltip and history chooser.

The editor is the only editable SPARQL surface. Format applies to that document and participates in its undo stack. Run executes the text currently displayed. No navigation, generation or formatting action implicitly runs a query.

Generated explanations and assumptions are kept in a disclosure under the SPARQL heading. The collapsed summary says that the document was generated and whether it has been run. When the ontology context may have changed, the summary exposes that condition before the disclosure is opened.

A validation problem does not discard the generated text. The document opens in the editor with a visible explanation and Run disabled for the unchanged invalid proposal. The user can correct the text there or generate another query. Subsequent execution still goes through the normal query engine and its validation.

## Narrow and maximized panes

The layout responds to the Query pane's measured width, not the application's total window width. A maximized application can still contain a narrow query column. A detached Query window can be wide enough for two surfaces even when the main application is not.

At 860 CSS pixels or more, the composer occupies a bounded column on the left. The editor occupies the right. Executed results open in separate workbench tabs. The composer can scroll independently, so expanding context does not move the code or its Run control out of the document area.

Below 860 pixels, opening Compose query temporarily gives the body to the composer. The history strip and action toolbar stay available. The editor remains mounted to preserve its model, but is hidden while the form is visible. Closing the form immediately returns to the query.

When generation finishes and the user has not moved on, the new query opens and the narrow composer closes. This makes the generated SPARQL the next visible state. The request remains stored, so reopening the composer permits refinement without retyping.

The 860-pixel breakpoint is an Axiom implementation choice. It leaves room for a usable request form and a code column in the wide layout. It is not a threshold prescribed by Microsoft or WCAG. It should be revisited if actual usage shows excessive wrapping at common zoom levels.

The toolbar wraps instead of forcing horizontal scrolling. Open results appears in the query status after a run. Result-specific actions belong to the results tab. At very small widths, the New query text can collapse to a plus icon while its accessible name and tooltip remain. The history arrows retain their target size.

The user subsequently requested results as first-class workbench tabs. That replaces the initial editor/results splitter. A successful run opens a numbered Query results tab in the existing results group. For the first run, it uses the Individuals group when separate from Query, otherwise the main Graph group. The editor keeps its available height. Results can be moved, detached, maximized and closed through the existing pane controls. Changing the pane arrangement retains open results.

For a short docked pane, splitting width and height simultaneously is expensive. The compact composer therefore gets the full body while the user is describing a query. The generated document then receives that space. Maximizing preserves the same query identity and controls while exposing the side-by-side layout.

## Asynchronous generation

An agent invocation may outlast several edits or a navigation action. Completion must therefore be reconciled against the source document, not against whichever editor happens to be mounted when the promise resolves.

At generation start, Axiom saves the current draft and records the source query identifier and edit version. On completion it creates a new query document. If the same source remains selected and unchanged, Axiom opens the generated document.

If the user edited the source or selected another query, Axiom keeps that current document in place. A status strip says that a generated query is ready and offers Open generated query. The generated text already exists in history and will not depend on keeping the composer open.

The renderer also accounts for a last keystroke that has not reached its debounced disk save. A response can arrive during that interval. The client retains the local draft and restores the intended selection before accepting the generated query as pending. A deterministic regression covers this timing case.

Closing the composer does not cancel the invocation. Its progress text explains that the user can close the form and keep working. Cancellation has a separate control. Reopening the composer reads the active service state, allowing the user to cancel without having kept the original form mounted.

An unsupported request creates no empty history page. Its explanation stays in the composer. A query that fails proposal validation is different: it contains potentially useful text and therefore becomes an editable document with the validation message attached.

Navigation itself does not move focus because an agent completed. Explicit Previous, Next, New query and Open generated query actions return focus to the chosen editor. Status announcements should remain short so that a screen reader does not repeatedly announce query text or every autosave.

## Query results and freshness

Each execution has an immutable record containing the exact SPARQL, originating query identifier, title, ontology, completion time, summary, workspace epoch and application session. Its visible run number continues across sessions. The history file stores execution records separately from editable query documents; pane layout stores only the execution reference. The worker retains result rows under that execution and query identity.

Paging through queries leaves results tabs in place. Open results returns to that document's last execution. Open query in a results tab selects the original query when its content is unchanged; otherwise it creates a recoverable copy of the executed text without replacing the newer draft. The tab also exposes Executed SPARQL directly, including when the Query pane is closed. If the user changes query content afterward, the editor status identifies its last run as belonging to the previous version. Comparison ignores spacing, line breaks, comments and keyword capitalization. Formatting does not rerun the query or alter the recorded execution. If the ontology changes, the results tab states that the rows show earlier data.

Result retention has a different lifetime from query text. Text and execution details are persisted to disk. Rows are retained in memory with a least-recently-used policy: at most eight result sets and a combined target of 250,000 rows, while always allowing the newest single result set. The engine's existing per-query result cap still applies.

After eviction or application restart, the query remains available but its old rows do not. The pane says that previous results are no longer retained. It does not silently run the query again, show another query's rows or claim the old summary is a current result.

These limits are implementation tradeoffs, not UX standards. Persisting all row sets would require a separate storage and cleanup design. That would add substantial disk use and complicate freshness across changed ontologies. The current change preserves the authored work and makes the shorter row lifetime explicit.

## Persistence and recovery

Query documents are stored in query-history.json under Axiom's user-data directory. They are separate from layout preferences and from the ontology workspace file. Loading another workspace therefore does not erase the query collection.

Each entry records creation order, text, source, title, origin and available generation or execution metadata. Cursor and scroll state can be retained. Monaco models are kept independently for recently used documents, with a bounded cache of 20 models. Undo survives ordinary paging among those models. Undo stacks are not serialized across application restart or model eviction.

The history service serializes writes and replaces the file through a temporary file, retaining the preceding version as a backup. It does not automatically prune old query documents. The current file-size limit is 50 MB, measured by serialized text length; a query is limited to 100,000 characters. Reaching a limit produces an error instead of deleting older entries.

A corrupt history file is kept intact and reported. A storage error leaves the editor text available and offers a save retry. These safeguards are necessary because a discreet navigation control can otherwise conceal a destructive storage policy.

The history chooser searches complete query text, titles and origin information. It presents the newest 100 matches rather than mounting every row at once. The total match count and an instruction to refine the search appear when additional matches exist. Older queries remain searchable even when they fall outside the visible list.

This release does not provide a dedicated history export or deletion manager. The retained file and backup make the storage inspectable, but a future management interface should provide deliberate export and removal before high-volume users reach the limit. Automatic deletion should not be added as an undocumented workaround.

## Accessibility and interaction checks

The history strip has a navigation label. Previous and Next use accessible names that do not depend on interpreting a chevron glyph. The position button identifies the searchable history. New query retains its name when its text is visually hidden.

The chooser uses the existing modal dialog component. Keyboard focus enters the search field, remains within the dialog, and returns to its initiating control after dismissal. Escape closes it. These behaviors follow the WAI-ARIA dialog pattern.[^9]

The generated-query notification uses a status region and a regular button. Validation and save failures use alert semantics. Ordinary save indicators remain visually available without announcing every keystroke.

Desktop tests check the absence of horizontal overflow at a compact detached-window width, the arrow target dimensions and the presence of only one main editor. They also exercise keyboard dismissal of history and editor Undo after navigating between documents. A complete accessibility assessment would additionally require screen-reader use, high-contrast review and zoom testing across more display scales.

## Verification and scope

| Boundary | Required behavior |
| --- | --- |
| Main-process history | Preserve documents and creation order across saves and restart |
| Agent delivery | Open a new document when appropriate; preserve newer work otherwise |
| Renderer debounce | Retain the last keystroke when delivery precedes autosave |
| Monaco lifecycle | Preserve independent editing and view state across query selection |
| Results | Keep each run in a separate workbench tab; reopen its executed query without overwriting drafts and explain expired rows |
| Query chooser | Search the full document and retain keyboard focus behavior |
| Narrow pane | Return from generation to the visible editor without duplicate SPARQL |
| Wide pane | Keep the composer beside the editor; results remain independently dockable |
| Real Codex integration | Generate through Codex on PATH and execute through the normal SPARQL path |

Normal desktop tests use a deterministic provider fixture for timing, cancellation and invalid-output cases. The explicitly invoked Codex suite remains separate. It checks the real executable and sign-in path, extraction, automatic document delivery, preservation of the source and actual result semantics.

The local SPARQL conformance suite continues to test the engine independently of this interaction change. Query history cannot compensate for missing language support, and successful UI tests are not evidence of language conformance.

The remaining usability questions concern navigation at very large history sizes, preferred title editing and how users manage collections across several ontologies. A searchable history provides a practical starting point. Subsequent changes should be driven by observed retrieval difficulty and storage usage rather than by adding more persistent controls to every pane.

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


## Desktop examples

The following screenshots were captured from desktop checks on this machine. The compact window uses 520 CSS pixels of content width; the wide detached window uses 1,320. Windows display scaling changes the exported image dimensions.

![Compact query editor](../artifacts/testing/query-history-compact.png)

The compact composer has closed after generation, leaving the generated query visible. History remains above the editor; results have their own workbench tab.

![Wide query workspace with composer beside the editor](../artifacts/testing/query-history-wide.png)

The wide layout retains the request beside the working SPARQL document. Query text is not duplicated in the composer.

![Query pane maximized in the main workbench](../artifacts/testing/query-history-maximized.png)

Maximizing the pane preserves the selected history entry and expands the same editor.

![Query results remain available after closing the editor](../artifacts/testing/query-results-editor-closed.png)

The results tab retains the executed SPARQL and offers Open query after the editor closes. Its grid occupies the tab body.

![Results in a narrow detached window](../artifacts/testing/query-results-compact.png)

The results toolbar wraps at narrow widths. The result set and its source reference remain available independently of the editor.

![Results in a wide detached window](../artifacts/testing/query-results-maximized.png)

A wider results window gives its space to the grid while keeping the execution details available above it.
