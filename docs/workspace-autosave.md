# Workspace autosave

Axiom saves the full workspace every 30 seconds and again when the application closes. Named workspaces update their existing .axiom file. File > Close, New, Open and Import also save the current workspace before switching. A close request received during a workspace change waits for that operation to finish, then saves and closes.

Each snapshot includes the ontology, every graph's nodes and coordinates, pins, routes, layout and spacing, cluster outlines and radial guides, edge and count visibility, node admission settings, styles, selection, cameras, docked pane layout, pane settings, and window position. Query history continues to use its own persistent store.

Unnamed workspaces recover from the last-session copy in Axiom's application data. Closing or switching away also retains a separate .axiom copy in that profile's workspaces directory, available through File > Open > Recent. Importing an OWL or RDF file does not make autosave overwrite the original source file. File > Save as chooses a user-managed workspace location.

Unapplied source edits and unfinished grid rows survive as drafts. Autosave does not apply source text. After reopening, use Save source in Details or Apply changes in Source. A draft whose underlying ontology changed remains stale after restart.

Writes use a temporary file before replacing the destination and retain a previous copy. If a final save fails, Axiom stays open and offers error details. Periodic failures appear in the Error log and are retried at the next interval. The recovery copy is written before the named file so a missing destination does not erase the current session.
