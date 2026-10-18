# Move classes in the taxonomy

Drag a class onto another class in Hierarchy to make the target its parent. Ctrl-click selects several classes; dragging any selected row moves the selected branches together. A selected descendant stays beneath its selected ancestor, so each branch moves once. The move replaces only the rdfs:subClassOf assertion for the branch being dragged. Other parents, child classes, instances, annotations, named graph provenance and OWL definitions remain intact. The whole drop is one transaction: one Undo reverses it and Redo reapplies it (#91).

For a branch derived from an equivalent-class definition, the drop adds an explicit rdfs:subClassOf assertion. It does not rewrite the definition. Classes with multiple parents appear beneath their first visible asserted parent; the drop target becomes that parent. The same ordering is used by the stylesheet hierarchy.

Hovering over a collapsed target for 600 ms expands it. Holding within 28 px of the tree's top or bottom scrolls the taxonomy, faster toward the edge. The action row names the destination or explains the block, and the target uses the corresponding tint. Dropping on empty tree space moves the branches under owl:Thing. Self-parenting, descendant cycles and a destination that is already every dragged branch's displayed parent are blocked. Dragging owl:Thing shows a root explanation. A changed ontology invalidates the entire drag.

After a move, **Undo move** appears in the footer and **Undo the last move** becomes available in More actions. They reverse the app's last change and disappear when that move leaves the top of its undo history, or when the hierarchy type switches. In a shallow pane, Undo remains in More actions. Properties can be dragged into Details, but cannot be reparented by dragging.

Filtering retains matching rows and their ancestors, and holds those branches open. Clearing the filter restores the saved expansion. The footer reports visible rows against the total number of classes or properties, including roots. Class counts are direct instances; property counts are asserted statements using that predicate. Counts are text; **Show instances** remains in each class's context menu.

The updated relationships appear in Details, Source and graph views and are included in normal workspace saving and autosave. Dragging a node from Hierarchy into Details continues to open it without changing its parent.
