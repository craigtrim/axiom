# Workbench controls

The Windows title bar shows **Axiom | absolute path**, with the filename in bold. Open workspaces use the workspace path; imported ontologies use their source file path until a workspace is saved. Unsaved documents show their name without an invented path. An asterisk indicates unsaved changes. Windows retains the native minimize, maximize and close controls.

Find is available through **Edit > Find** or **Ctrl+F**. Its compact modal focuses the search field and offers type-ahead matches. Enter or a match opens the full results in the dockable **View > Find** pane. New class, New individual, Undo, Redo and Save are available from their menus, context actions and keyboard shortcuts. The duplicate filename and command-palette icon have been removed. **View > Command palette** and **Ctrl+Shift+P** open the palette. **Edit > Keyboard shortcuts** provides remappable shortcuts and menu access keys.

In Details, the predicate list starts with the entity's existing predicates in their displayed order, without duplicates. Other predicates follow. `rdf:type` is not offered in the dropdown; existing type declarations remain in the grid.

Annotation values such as `rdfs:seeAlso` accept text and offer matching resources through typeahead. Choose a resource match to make a link, or choose **Use text** to store the typed text. Editing an existing text value preserves its language and datatype. New rows use the existing predicate's value type where available. Workspace saves retain unfinished rows and unapplied source edits as drafts. Complete grid edits are applied when using File > Save; source edits still require their own Save source or Apply changes action.

The Find pane provides entity-type filters, name/IRI scope, word, phrase and exact matching, sorting, recent searches and pagination. It retains its query and filters when reopened or restarted. Selecting a result enables Details, taxonomy navigation, new/current graph actions and Copy IRI. Searching itself leaves the graph unchanged. Source and query editors retain their local Ctrl+F behavior.
