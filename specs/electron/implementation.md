# Electron implementation

Electron and TypeScript are the sole active application. The previous WinUI source, tests, scripts and documentation are preserved in [the archive](../../archive/README.md). Its generated outputs and active project directories have been removed.

The delivered workbench uses native File, Edit, View, Graph, Query, Window and Help menus. FlexLayout supplies resizable groups, draggable tabs, pane closing and reopening, floating, separate windows and reattachment. The Window menu provides keyboard alternatives. Theme, layout, window bounds, filters and query text persist locally.

The domain port retains the deterministic pizza fixture at all four sizes, indexed queries and neighbours, bounded graph admission, protected nodes, four layouts, editing with Undo and Redo, and graph export. Monaco and AG Grid Community supply the editor and virtualized tables. All runtime resources are packaged locally.

## Visible-node control

The graph displays at most the configured limit, independent of the number of loaded records. The exact-number field and slider accept 100 to 3,000 nodes. The initial limit is 1,000 and the chosen limit is remembered. Saved workspaces retain graph membership, focus, pins and the limit.

A smaller limit is useful for reading relationships and labels. Increasing the limit makes room for subsequent exploration; it does not populate the canvas automatically. Reducing it evicts eligible nodes. A reduction that cannot retain all pinned and focused nodes is rejected with an explanation.

Node labels avoid overlaps. Neighbour badges indicate what can be expanded, and the footer reports displayed nodes, the configured limit, relationships and held-back neighbour counts. Held-back counts are summed across visible nodes; they are not a count of unique undisplayed entities in the entire dataset.

## Current scope and tradeoffs

The package contains the Electron runtime and runs without Node.js or .NET installed separately. It is a portable Windows x64 folder. Keep the supporting files beside Axiom.exe.

Workspace files use the .axiom format. Full OWL file import, ontology reasoning and complete SPARQL remain outside the original implementation scope. The interface identifies asserted data and the supported query subset.

This build is unsigned. Measured performance, acceptance coverage and remaining release checks are recorded in [verification](../../docs/verification.md). The [research report](README.md) preserves the original pros, cons and cited architectural assessment; [implementation decisions](../../docs/decisions.md) describes the final choices.
