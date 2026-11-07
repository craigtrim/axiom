# Workspace autosave

Axiom checks for ontology changes every 30 seconds. An edit, undo or redo of ontology data triggers one autosave on the next tick. Paging, scrolling, selection, graph layout changes and unapplied drafts do not trigger autosave. Named workspaces update their existing .axiom file.

An autosave pairs the current ontology with the layout and drafts from the last successful explicit save, closing save or workspace load. File > Save, Save As and closing save the current layout and drafts too. File > Close, New, Open and Import save the current workspace before switching. A close request received during a workspace change waits for that operation to finish, then saves and closes.

Saved layout includes every graph's nodes and coordinates, pins, routes, spacing, cluster outlines and radial guides, display settings, node admission settings, styles, selection, cameras, docked panes and window position. Query history continues to use its own persistent store.

Before #217, a page turn changed the autosave key and caused a full ontology checkpoint. With a large ontology, encoding that checkpoint blocked the data process that also answers page requests. Restricting the trigger to ontology edits prevents browsing from starting that work.

During a checkpoint, the status bar reads **Saving…** until encoding and disk writes finish. Encoding yields between bounded slices so pages and other reads can respond. Ontology edits submitted during encoding wait for that snapshot to finish and belong to the next checkpoint. The current checkpoint keeps one consistent version of the ontology and its captured layout.

Unnamed workspaces recover from the last-session copy in Axiom's application data. Closing or switching away also retains a separate .axiom copy in that profile's workspaces directory, available through File > Open > Recent. Importing an OWL or RDF file does not make autosave overwrite the original source file. File > Save as chooses a user-managed workspace location.

Each running instance uses its own profile and last-session copy. A named workspace has one owning instance: Open, Recent and Save As raise that owner instead of sharing a save destination. If a restored session names a workspace already in use, its saved contents and drafts resume as an unnamed recovery copy. See [Independent instances](multiple-instances.md).

Unapplied source edits and unfinished grid rows survive as drafts after an explicit or closing save. After reopening, use Save source in Details or Apply changes in Source. A draft whose underlying ontology changed remains stale after restart.

Writes use a temporary file before replacing the destination and retain a previous copy. If a final save fails, Axiom stays open and offers error details. Periodic failures appear in the Error log and are retried at the next interval. The recovery copy is written before the named file so a missing destination does not erase the current session.
