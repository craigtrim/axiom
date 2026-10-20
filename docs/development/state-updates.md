# State updates

The domain worker returns a complete snapshot for a direct `state` request. Broadcasts use the same view metadata but omit unchanged entity, type and customer catalogs. The main process and each renderer merge these updates with their current snapshot. A view-only update preserves the entity array by reference.

Entity projections and derived counts are computed once per store revision. Within a workspace, broadcasts carry changed entity records and removed IRIs. Insertions and ordering changes carry positions so the merged array matches a full snapshot. Comparisons include instance, assertion and descendant counts, so edits update affected ancestors as well as the edited record. A new dataset epoch sends complete catalogs.

These changes implement #125, part of #122. Regression tests cover the generated 21,461-individual fixture, renderer references, label edits, ancestor counts, Undo/Redo and workspace replacement. View-only event size stays independent of catalog size; graph data still follows the visible graph.
